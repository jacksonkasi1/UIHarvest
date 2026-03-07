// ** import core packages
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// ** import apis
import { AgentDriver } from "./agent-driver.js";
import { GeminiClient } from "./gemini-client.js";

// ** import utils
export interface ExtractedDesignSystem {
  meta: any;
  tokens: any;
  components: any[];
  patterns: any[];
  sections: any[];
  assets: any;
  interactions: any;
  cssVariables: any[];
  fontFaces: any[];
  layoutSystem: any;
}

export async function runVisionLoop(
  driver: AgentDriver,
  gemini: GeminiClient,
  url: string,
  outputDir: string,
  shotsDir: string
): Promise<any> {
  const components: any[] = [];
  let viewportCount = 0;
  let hasMoreToScroll = true;

  const MAX_VIEWPORTS = 5; // safety limit

  while (hasMoreToScroll && viewportCount < MAX_VIEWPORTS) {
    viewportCount++;
    console.log(`\n👁️  Processing viewport ${viewportCount}...`);

    // 1. Snapshot & Annotate
    await driver.snapshot(); // Still useful to initialize refs if needed

    const annotatedPath = path.join(shotsDir, `annotated-${viewportCount}.png`);
    const cleanPath = path.join(shotsDir, `clean-${viewportCount}.png`);

    const screenshotData = await driver.screenshotAnnotated(annotatedPath);
    await driver.screenshot(cleanPath);

    let elements: any[] = [];
    if (screenshotData?.data?.annotations) {
      elements = screenshotData.data.annotations;
    } else if (screenshotData?.annotations) {
      elements = screenshotData.annotations;
    }

    // Read the annotated image
    const imageBase64 = fs.readFileSync(annotatedPath).toString("base64");

    // 2. Vision Reasoning
    const prompt = `You are an expert UI/UX extractor. Analyze this annotated screenshot.
The user has provided a JSON snapshot of the elements with their @refs.

Return a JSON object with:
{
  "componentsToExtract": [
    {
      "ref": "@e1",
      "type": "card",
      "subType": "content-card",
      "name": "Feature Card",
      "patternId": "pattern-1"
    }
  ],
  "actionsToTake": [
    { "action": "click", "ref": "@e5" }
  ]
}

Group identical components into the same patternId.
Identify standalone UI components like cards, navigation bars, buttons, etc.
Only include components that are clearly visible and significant.`;

    const systemPrompt = "You are an expert Vision-Agent. Respond ONLY in valid JSON.";

    console.log("🤔 Asking Gemini for components...");
    let aiResponse: any;
    try {
      aiResponse = await gemini.analyzeImageJson(
        imageBase64,
        "image/png",
        prompt + "\n\nSnapshot Elements: " + JSON.stringify(elements).slice(0, 10000),
        systemPrompt,
        { jsonMode: true }
      );
    } catch (e) {
      console.error("Gemini failed:", e);
      break;
    }

    const { componentsToExtract = [], actionsToTake = [] } = aiResponse;

    console.log(`✨ Found ${componentsToExtract.length} components, ${actionsToTake.length} actions.`);

    // 3. Extraction & Cropping
    for (const comp of componentsToExtract) {
      let ref = comp.ref;
      if (ref && ref.match(/^@\d+$/)) ref = ref.replace("@", "@e");

      const cleanRef = ref ? ref.replace("@", "") : "";

      const elData = elements.find((e: any) => e.ref === ref || e.ref === cleanRef || e.id === ref || e.locator === ref || e.attributes?.ref === ref);
      
      // agent-browser snapshot format might vary, let's try to extract bbox
      // typical format: { ref: "@e1", bounds: [x,y,w,h] } or boundingBox: {x,y,w,h}
      let box = null;
      if (elData?.box) {
        box = { x: elData.box.x, y: elData.box.y, width: elData.box.width, height: elData.box.height };
      } else if (elData?.bounds && Array.isArray(elData.bounds)) {
        box = { x: elData.bounds[0], y: elData.bounds[1], width: elData.bounds[2], height: elData.bounds[3] };
      } else if (elData?.boundingBox) {
        box = { x: elData.boundingBox.x, y: elData.boundingBox.y, width: elData.boundingBox.width, height: elData.boundingBox.height };
      } else if (elData?.bounds) {
        box = { x: elData.bounds.x, y: elData.bounds.y, width: elData.bounds.width, height: elData.bounds.height };
      } else if (elData?.rect) {
        box = { x: elData.rect.x, y: elData.rect.y, width: elData.rect.width, height: elData.rect.height };
      }

      if (!box) {
        console.log(`⚠️  Could not find box for ref: ${ref}`, elData ? "(element found but no box)" : "(element not found)");
      }

      if (box && box.width > 0 && box.height > 0) {
        const compId = `vision-comp-${components.length + 1}`;
        const shotName = `${compId}.png`;
        const outPath = path.join(shotsDir, shotName);

        // Precise sharp cropping based on bounding box
        try {
          const metadata = await sharp(cleanPath).metadata();
          const imgW = metadata.width || 1440;
          const imgH = metadata.height || 900;

          const cropX = Math.max(0, Math.round(box.x));
          const cropY = Math.max(0, Math.round(box.y));
          const cropW = Math.min(imgW - cropX, Math.round(box.width));
          const cropH = Math.min(imgH - cropY, Math.round(box.height));

          if (cropW >= 10 && cropH >= 10) {
            await sharp(cleanPath)
              .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
              .toFile(outPath);
            
            // eval stdin to get HTML and styles
            // agent-browser snapshot might only give ref, we can query DOM by data-ref or bounding box?
            // Actually, we can just use eval with the precise coordinates to find the element
            const js = `
              (() => {
                function getElementByBox(x, y) {
                  return document.elementFromPoint(x + 5, y + 5);
                }
                const el = getElementByBox(${box.x}, ${box.y});
                if (el) {
                  const s = window.getComputedStyle(el);
                  return JSON.stringify({
                    html: el.outerHTML,
                    styles: {
                      backgroundColor: s.backgroundColor,
                      color: s.color,
                      borderRadius: s.borderRadius,
                      padding: s.padding,
                      margin: s.margin,
                      display: s.display
                    }
                  });
                }
                return "{}";
              })();
            `;
            const evalResultStr = await driver.evalStdin(js);
            let extractedHtml = "";
            let extractedStyles = {};
            try {
              const res = JSON.parse(evalResultStr);
              extractedHtml = res.html || "";
              extractedStyles = res.styles || {};
            } catch(e){}

            components.push({
              id: compId,
              type: comp.type || "component",
              subType: comp.subType || "detected",
              name: comp.name || "AI Component",
              html: extractedHtml,
              rect: box,
              styles: extractedStyles,
              dataAttributes: {},
              signature: `vision|${comp.type}|${Math.round(cropW/20)*20}|${Math.round(cropH/10)*10}`,
              structuralSignature: "",
              semanticSlots: [],
              children: [],
              parentId: null,
              patternId: comp.patternId || null,
              instanceIndex: 0,
              confidence: 90,
              screenshot: `screenshots/${shotName}`,
              visionName: comp.name,
              visionType: comp.type,
            });
          }
        } catch (e) {
          console.error("Crop failed for", comp.ref, e);
        }
      }
    }

    // 4. Interaction
    if (actionsToTake.length > 0) {
      for (const action of actionsToTake) {
        if (action.action === "click" && action.ref) {
          let ref = action.ref;
          if (ref.match(/^@\d+$/)) ref = ref.replace("@", "@e");
          console.log(`🖱️ Clicking ${ref}`);
          try {
            await driver.click(ref);
            await driver.wait(1000);
          } catch (e) {
            console.warn(`⚠️ Click failed for ${ref}`);
          }
        }
      }
    } else {
      // 5. Scroll & Continue
      const scrollRes = await driver.evalStdin(`
        (() => {
          const before = window.scrollY;
          window.scrollBy(0, 800);
          const after = window.scrollY;
          return JSON.stringify({ scrolled: after > before });
        })();
      `);
      
      try {
        const { scrolled } = JSON.parse(scrollRes);
        hasMoreToScroll = scrolled;
        if (scrolled) {
          await driver.wait(1000);
        }
      } catch(e) {
        hasMoreToScroll = false;
      }
    }
  }

  return components;
}
