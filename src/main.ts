import "dotenv/config";
import { chromium, Page, BrowserContext } from "playwright";
import path from "path";
import fs from "fs";
import os from "os";
import { extractDesignSystem } from "./extractor.js";
import { DesignAnalyzer } from "./analyzer.js";
import { startServer } from "./server.js";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "output");
const SHOTS = path.join(OUTPUT, "screenshots");
const ASSETS = path.join(OUTPUT, "assets");
const FONTS = path.join(OUTPUT, "fonts");

function ensureDirs() {
  [OUTPUT, SHOTS, ASSETS, FONTS].forEach((d) => fs.mkdirSync(d, { recursive: true }));
}

async function runInParallel<T>(items: T[], concurrency: number, fn: (item: T, workerId: number) => Promise<void>) {
  let index = 0;
  const workers = new Array(concurrency).fill(0).map(async (_, workerId) => {
    while (index < items.length) {
      const item = items[index++];
      if (item) await fn(item, workerId);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("\n  Usage:  npm start <url>\n");
    console.error("  Example:  npm start https://asana.com/features/project-management\n");
    process.exit(1);
  }

  ensureDirs();
  console.log(`\n🔍  Target: ${url}\n`);

  // Detect System Specs for Parallelism
  const cpuCount = os.cpus().length;
  const memGb = os.totalmem() / (1024 ** 3);
  let concurrency = Math.max(1, Math.min(cpuCount, Math.floor(memGb / 2)));
  if (process.env.MAX_CONCURRENCY) concurrency = parseInt(process.env.MAX_CONCURRENCY, 10);
  console.log(`⚡  System spec: ${cpuCount} Cores, ${memGb.toFixed(1)}GB RAM`);
  console.log(`⚡  Auto-configured concurrency level: ${concurrency} (Override with MAX_CONCURRENCY env var)`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
  });

  // Aggressive Network Blocking
  await ctx.route("**/*", (route) => {
    const rType = route.request().resourceType();
    const rUrl = route.request().url().toLowerCase();
    
    // Block unnecessary trackers, ads, and heavy media
    const isTracker = ["google-analytics", "analytics", "tracker", "doubleclick", "facebook", "mixpanel", "segment"].some(t => rUrl.includes(t));
    if (isTracker || ["media", "websocket", "manifest", "other"].includes(rType)) {
      return route.abort();
    }
    return route.continue();
  });

  // Intercept font files
  const fontFiles: { url: string; body: Buffer }[] = [];
  const page = await ctx.newPage();
  page.on("response", async (response) => {
    const url2 = response.url();
    const ct = response.headers()["content-type"] || "";
    if (ct.includes("font") || url2.match(/\.(woff2?|ttf|otf|eot)(\?|$)/)) {
      try {
        const body = await response.body();
        fontFiles.push({ url: url2, body });
      } catch {}
    }
  });

  console.log("📄  Loading page…");
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch {
    console.log("⚠️   navigation timeout, continuing…");
  }

  // Spoof IntersectionObserver and scroll fast to trigger lazy load instantly
  console.log("📜  Triggering aggressive lazy loading & spoofing intersection…");
  await page.evaluate(async () => {
    // Override IntersectionObserver to fire immediately
    const OriginalObserver = window.IntersectionObserver;
    window.IntersectionObserver = function (callback: any, options: any) {
      const observer = new OriginalObserver(callback, options);
      const originalObserve = observer.observe.bind(observer);
      observer.observe = (element) => {
        originalObserve(element);
        // Force callback trigger for this element
        callback([{ isIntersecting: true, target: element, intersectionRatio: 1, boundingClientRect: element.getBoundingClientRect(), intersectionRect: element.getBoundingClientRect(), rootBounds: null, time: Date.now() }] as IntersectionObserverEntry[], observer);
      };
      return observer;
    } as any;
    
    // Fast scroll to bottom
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 800;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 50); // Very fast scroll
    });
  });

  // Wait for any newly triggered requests to finish
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {}

  console.log("⏳  Waiting for fonts and images to complete…");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = img.onerror = resolve;
          setTimeout(resolve, 5000); // 5s Timeout for very slow images
        });
      })
    );
  });

  // Final pause for hydration and layout shifts
  await page.waitForTimeout(1000);

  // Fix sticky/fixed elements before screenshots
  console.log("🛠️   Adjusting fixed elements for full-page screenshot…");
  await page.evaluate(() => {
    const elements = document.querySelectorAll("*");
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLElement;
      const style = window.getComputedStyle(el);
      if (style.position === "fixed" || style.position === "sticky") {
        el.style.setProperty("position", "absolute", "important");
      }
    }
  });

  // Dismiss cookie banners
  for (const sel of [
    'button:has-text("Accept")', 'button:has-text("Accept all")',
    'button:has-text("Got it")', 'button:has-text("OK")',
    '[id*="cookie"] button', '[class*="cookie"] button', '[id*="consent"] button',
  ]) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 })) await btn.click();
    } catch {}
  }
  await page.waitForTimeout(1000);

  // Extract
  console.log("🔬  Extracting design system…");
  const rawData = await extractDesignSystem(page);

  // Summary
  const compTypes: Record<string, number> = {};
  rawData.components.forEach((c: any) => {
    const key = `${c.type}/${c.subType}`;
    compTypes[key] = (compTypes[key] || 0) + 1;
  });
  console.log("\n📊  Extraction Summary:");
  console.log(`    Colors:      ${rawData.tokens.colors.length}`);
  console.log(`    Gradients:   ${rawData.tokens.gradients.length}`);
  console.log(`    Typography:  ${rawData.tokens.typography.length}`);
  console.log(`    Spacing:     ${rawData.tokens.spacing.length}`);
  console.log(`    Radii:       ${rawData.tokens.radii.length}`);
  console.log(`    Shadows:     ${rawData.tokens.shadows.length}`);
  console.log(`    Borders:     ${rawData.tokens.borders.length}`);
  console.log(`    Transitions: ${rawData.tokens.transitions.length}`);
  console.log(`    Components:  ${rawData.components.length}`);
  Object.entries(compTypes).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`      ${k}: ${v}`);
  });
  console.log(`    Patterns:    ${rawData.patterns.length}`);
  console.log(`    Sections:    ${rawData.sections.length}`);
  console.log(`    Images:      ${rawData.assets.images.length}`);
  console.log(`    SVGs:        ${rawData.assets.svgs.length}`);
  console.log(`    Videos:      ${rawData.assets.videos.length}`);
  console.log(`    Pseudos:     ${rawData.assets.pseudoElements.length}`);
  console.log(`    Hovers:      ${rawData.interactions.hoverStates.length}`);
  console.log(`    CSS Vars:    ${rawData.cssVariables.length}`);
  console.log(`    Font Files:  ${fontFiles.length}`);
  console.log(`    Font Faces:  ${rawData.fontFaces.length}`);
  console.log(`    Containers:  ${rawData.layoutSystem.containerWidths.join(", ")}px`);

  // Full page screenshot
  console.log("\n📸  Full page screenshot…");
  try {
    await page.screenshot({ path: path.join(SHOTS, "full-page.png"), fullPage: true, type: "png", timeout: 45000, animations: "disabled" });
    (rawData as any).fullPageScreenshot = "screenshots/full-page.png";
  } catch (err) {
    console.log("⚠️   Full page screenshot failed, skipping…", err);
  }

  console.log(`📸  Section screenshots (${rawData.sections.length} total)…`);
  // Section screenshots
  let secCount = 0;
  for (const sec of rawData.sections) {
    secCount++;
    process.stdout.write(`\r    ↳ Capturing section ${secCount}/${rawData.sections.length}`);
    try {
      const loc = page.locator(`[data-extract-id="${sec.id}"]`).first();
      if (await loc.isVisible({ timeout: 100 })) {
        const fname = `${sec.id}.png`;
        await loc.screenshot({ path: path.join(SHOTS, fname), type: "png", timeout: 5000, animations: "disabled" });
        (sec as any).screenshot = `screenshots/${fname}`;
      }
    } catch {}
  }
  console.log(""); // Newline after progress

  console.log(`📸  Component screenshots (up to 200)…`);
  
  // Create parallel pages if concurrency > 1
  const pages: Page[] = [page];
  
  // Component screenshots
  const seenSig = new Set<string>();
  const compsToProcess = [];
  for (const comp of rawData.components) {
    const sigKey = `${comp.type}|${comp.subType}|${comp.signature}`;
    if (!seenSig.has(sigKey) && compsToProcess.length < 200) {
      seenSig.add(sigKey);
      compsToProcess.push(comp);
    }
  }

  let shotCount = 0;
  let compAttempted = 0;
  
  // Use a max concurrency of 1 for DOM-dependent screenshots to prevent Playwright crashes
  // and because the data-extract-id attributes only exist on the main page.
  await runInParallel(compsToProcess, 1, async (comp, workerId) => {
    const p = page;
    compAttempted++;
    process.stdout.write(`\r    ↳ Attempting component ${compAttempted}/${compsToProcess.length} (Captured: ${shotCount})`);
    try {
      const loc = p.locator(`[data-extract-id="${comp.id}"]`).first();
      if (await loc.isVisible({ timeout: 100 })) {
        const box = await loc.boundingBox();
        if (box && box.width > 5 && box.height > 5) {
          const fname = `${comp.id}.png`;
          await loc.screenshot({ path: path.join(SHOTS, fname), type: "png", timeout: 5000, animations: "disabled" });
          (comp as any).screenshot = `screenshots/${fname}`;
          shotCount++;
          process.stdout.write(`\r    ↳ Attempting component ${compAttempted}/${compsToProcess.length} (Captured: ${shotCount})`);
        }
      }
    } catch {}
  });
  console.log(""); // Newline after progress

  // Hover state screenshots
  console.log(`📸  Hover screenshots (${rawData.interactions.hoverStates.length} total)…`);
  let hoverCount = 0;
  await runInParallel(rawData.interactions.hoverStates as any[], 1, async (hover: any, workerId) => {
    const p = page; // Use main page where data-extract-id exists
    hoverCount++;
    process.stdout.write(`\r    ↳ Capturing hover ${hoverCount}/${rawData.interactions.hoverStates.length}`);
    try {
      const loc = p.locator(`[data-extract-id="${hover.componentId}"]`).first();
      if (await loc.isVisible({ timeout: 300 })) {
        await loc.hover({ timeout: 500 });
        await p.waitForTimeout(350);
        const fname = `${hover.componentId}-hover.png`;
        await loc.screenshot({ path: path.join(SHOTS, fname), type: "png", timeout: 15000, animations: "disabled" });
        (hover as any).screenshotHover = `screenshots/${fname}`;
        await p.mouse.move(0, 0);
        await p.waitForTimeout(200);
      }
    } catch {}
  });
  if (rawData.interactions.hoverStates.length > 0) console.log("");

  // Download image assets
  const totalImages = Math.min(rawData.assets.images.length, 80);
  console.log(`📦  Downloading image assets (${totalImages} total)…`);
  let downloadedCount = 0;
  await runInParallel(rawData.assets.images.slice(0, totalImages), concurrency, async (img, workerId) => {
    downloadedCount++;
    process.stdout.write(`\r    ↳ Downloading image ${downloadedCount}/${totalImages}`);
    try {
      // Use the context request to fetch in parallel
      const resp = await ctx.request.get((img as any).src, { timeout: 8000 });
      if (resp.ok()) {
        const ct = resp.headers()["content-type"] || "";
        let ext = "png";
        if (ct.includes("jpeg") || ct.includes("jpg")) ext = "jpg";
        else if (ct.includes("webp")) ext = "webp";
        else if (ct.includes("svg")) ext = "svg";
        else if (ct.includes("gif")) ext = "gif";
        const fname = `image-${downloadedCount}.${ext}`;
        fs.writeFileSync(path.join(ASSETS, fname), await resp.body());
        (img as any).localPath = `assets/${fname}`;
      }
    } catch {}
  });
  if (totalImages > 0) console.log("");

  // Save SVGs
  for (let i = 0; i < Math.min(rawData.assets.svgs.length, 80); i++) {
    const svg = rawData.assets.svgs[i];
    const fname = `icon-${i}.svg`;
    fs.writeFileSync(path.join(ASSETS, fname), svg.html);
    (svg as any).localPath = `assets/${fname}`;
  }

  // Save font files
  for (let i = 0; i < fontFiles.length; i++) {
    const f = fontFiles[i];
    const ext = f.url.match(/\.(woff2?|ttf|otf|eot)/)?.[1] || "woff2";
    const fname = `font-${i}.${ext}`;
    fs.writeFileSync(path.join(FONTS, fname), f.body);
    if (rawData.fontFaces[i]) (rawData.fontFaces[i] as any).localPath = `fonts/${fname}`;
  }

  await browser.close();

  // ══════════════════════════════════════════════
  // PHASE 2: AI ANALYSIS
  // ══════════════════════════════════════════════

  const analyzer = new DesignAnalyzer(rawData);
  let analysis: any = null;

  if (analyzer.isAiAvailable) {
    console.log("\n🤖  Phase 2: AI Analysis…\n");
    try {
      analysis = await analyzer.analyze();
      console.log(`\n  ✅  AI Analysis complete`);
      console.log(`      API calls: ${analysis.aiUsage.calls}`);
      console.log(`      Tokens:    ${analysis.aiUsage.tokens.toLocaleString()}`);
      console.log(`      Cost:      $${analysis.aiUsage.cost}`);
      console.log(`      Named colors:    ${analysis.namedTokens.colors.length}`);
      console.log(`      Named spacing:   ${analysis.namedTokens.spacing.length}`);
      console.log(`      Named typography: ${analysis.namedTokens.typography.length}`);
      console.log(`      Components:      ${analysis.componentLibrary.length}`);
      console.log(`      Total variants:  ${analysis.componentLibrary.reduce((s: number, c: any) => s + c.variants.length, 0)}`);
      console.log(`      Sections:        ${analysis.sectionBlueprint.length}`);
      console.log(`      Code snippets:   ${analysis.codeSnippets.length}`);
    } catch (err) {
      console.error("  ❌  AI Analysis failed:", (err as Error).message);
    }
  } else {
    console.log("\n⏭️   Skipping AI analysis (no OPENAI_API_KEY set)\n");
  }

  // ── Combine & Save ──
  const finalData = {
    ...rawData,
    analysis: analysis || null,
  };

  const jsonPath = path.join(OUTPUT, "design-system.json");
  fs.writeFileSync(jsonPath, JSON.stringify(finalData, null, 2));
  console.log(`\n✅  Saved → ${jsonPath}`);

  // ── Start Server ──
  startServer(finalData, OUTPUT, ROOT);
}

main().catch((err) => {
  console.error("❌  Fatal error:", err);
  process.exit(1);
});
