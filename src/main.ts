import "dotenv/config";

// ** import core packages
import { chromium, Page } from "playwright";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// ** import utils
import path from "path";
import fs from "fs";
import os from "os";

// ** import apis
import { extractDesignSystem } from "./extractor.js";
import { startServer } from "./server.js";
import { AgentDriver } from "./agent-driver.js";
import { GeminiClient } from "./gemini-client.js";
import { runVisionLoop } from "./vision-loop.js";
import { MemoryGenerator } from "./memory/generator.js";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "output");
const CHECKPOINTS = path.join(OUTPUT, "checkpoints");
const SHOTS = path.join(OUTPUT, "screenshots");
const ASSETS = path.join(OUTPUT, "assets");
const FONTS = path.join(OUTPUT, "fonts");

function ensureDirs() {
  [OUTPUT, CHECKPOINTS, SHOTS, ASSETS, FONTS].forEach((d) => fs.mkdirSync(d, { recursive: true }));
}

function removeOutputDir() {
  if (fs.existsSync(OUTPUT)) {
    fs.rmSync(OUTPUT, { recursive: true, force: true });
  }
}

function loadJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function saveJsonFile(filePath: string, value: any): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function normalizeUrl(input: string): string {
  try {
    const parsed = new URL(input);
    parsed.hash = "";
    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
      parsed.port = "";
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return input.replace(/\/+$/, "") || input;
  }
}

function urlsMatch(a: string, b: string): boolean {
  return normalizeUrl(a) === normalizeUrl(b);
}

async function shouldCleanOutput(force: boolean, targetUrl: string, resume: boolean): Promise<boolean> {
  if (force) return true;
  if (!fs.existsSync(OUTPUT)) return false;

  const files = fs.readdirSync(OUTPUT);
  if (files.length === 0) return false;

  const existingData = loadJsonFile<any>(path.join(OUTPUT, "design-system.json"));
  const existingUrl = existingData?.meta?.url as string | undefined;

  if (resume) {
    if (!existingData) {
      console.error("❌ --resume requested but no existing output checkpoint was found.");
      process.exit(1);
    }

    if (existingUrl && !urlsMatch(existingUrl, targetUrl)) {
      console.error(`❌ --resume target mismatch. Existing output is for ${existingUrl}. Use --force to replace it.`);
      process.exit(1);
    }

    console.log(`ℹ️   Resuming existing output for ${existingUrl || targetUrl}.`);
    return false;
  }

  if (existingUrl && !urlsMatch(existingUrl, targetUrl)) {
    const warning = `⚠️   Existing output belongs to ${existingUrl}, not ${targetUrl}.`;

    if (!process.stdin.isTTY) {
      console.error(`${warning}\nUse --force to clean old output before switching sites.`);
      process.exit(1);
    }

    const rl = readline.createInterface({ input, output });
    try {
      const answer = await rl.question("🧹  Output is for a different site. Clean output folder before run? (Y/n): ");
      return answer.trim() === "" || answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
    } finally {
      rl.close();
    }
  }

  if (!process.stdin.isTTY) {
    console.log("ℹ️   Existing output detected for the same site. Keeping existing files (use --force for a clean rerun or --resume to continue). ");
    return false;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question("🧹  Existing output found. Clean output folder before run? (y/N): ");
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
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

async function waitForStableBoundingBox(loc: any, page: Page, rounds = 3) {
  let prev: any = null;
  let current: any = null;
  for (let i = 0; i < rounds; i++) {
    current = await loc.boundingBox();
    if (!current) return null;
    if (prev) {
      const dx = Math.abs((current.x || 0) - (prev.x || 0));
      const dy = Math.abs((current.y || 0) - (prev.y || 0));
      const dw = Math.abs((current.width || 0) - (prev.width || 0));
      const dh = Math.abs((current.height || 0) - (prev.height || 0));
      if (dx <= 1 && dy <= 1 && dw <= 1 && dh <= 1) {
        return current;
      }
    }
    prev = current;
    await page.waitForTimeout(60);
  }
  return current;
}

async function dismissOverlays(page: Page) {
  for (const sel of [
    'button[aria-label*="close" i]',
    '[role="dialog"] button[aria-label*="close" i]',
    'button:has-text("Close")',
    'button:has-text("Dismiss")',
    '.hds-dialog button',
  ]) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 150 })) {
        await btn.click({ timeout: 300 });
      }
    } catch {}
  }
  try {
    await page.keyboard.press("Escape");
  } catch {}
}

async function shouldRunMemory(args: string[]): Promise<boolean> {
  if (args.includes("--memory")) return true;
  if (args.includes("--no-memory")) return false;

  if (!process.stdin.isTTY) return false;

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question("🧠  Run design-memory generation? (Y/n): ");
    const trimmed = answer.trim().toLowerCase();
    return trimmed === "" || trimmed === "y" || trimmed === "yes";
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const forceClean = args.includes("-f") || args.includes("--force");
  const noServe = args.includes("--no-serve");
  const resume = args.includes("--resume");
  const url = args.find((arg) => !arg.startsWith("-"));
  if (!url) {
    console.error("\n  Usage:  npm start <url>\n");
    console.error("  Example:  npm start https://asana.com/features/project-management -- --force\n");
    process.exit(1);
  }

  if (await shouldCleanOutput(forceClean, url, resume)) {
    removeOutputDir();
    console.log("🧹  Cleaned existing output folder.");
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
    // NOTE: do NOT block "other" — it includes preload/prefetch for fonts and CSS
    if (isTracker || ["media", "websocket", "manifest"].includes(rType)) {
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
    await page.goto(url, { waitUntil: "load", timeout: 90_000 });
  } catch {
    console.log("⚠️   navigation timeout, continuing…");
  }

  // Wait for a stable context — some sites do a JS redirect after domcontentloaded
  try {
    await page.waitForLoadState("load", { timeout: 15_000 });
  } catch {}
  await page.waitForTimeout(500);

  // Spoof IntersectionObserver and scroll fast to trigger lazy load instantly
  console.log("📜  Triggering aggressive lazy loading & spoofing intersection…");
  // Retry the evaluate up to 3 times in case a late redirect destroys the context
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
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
      break; // success — exit retry loop
    } catch (err: any) {
      if (attempt < 3 && err?.message?.includes("Execution context was destroyed")) {
        console.log(`⚠️   Context destroyed during scroll setup (attempt ${attempt}/3), retrying…`);
        await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(500);
      } else {
        console.log("⚠️   Scroll/intersection setup failed, continuing…", err?.message);
        break;
      }
    }
  }

  // Wait for any newly triggered requests to finish
  try {
    await page.waitForLoadState("networkidle", { timeout: 15000 });
  } catch {}

  console.log("⏳  Waiting for fonts and images to complete…");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = img.onerror = resolve;
          setTimeout(resolve, 8000); // 8s Timeout for very slow images
        });
      })
    );
  });

  // Final pause for hydration and layout shifts
  console.log("⏳  Waiting an extra 5 seconds for final layout settling…");
  await page.waitForTimeout(6000);

  console.log("🛠️   Keeping original layout (no forced fixed/sticky rewrite)…");

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

  // Dismiss modal/dialog overlays BEFORE extraction so component IDs stay consistent
  await dismissOverlays(page);
  await page.waitForTimeout(150);

  // Extract
  console.log("🔬  Extracting design system…");
  let rawData: any;
  if (resume && fs.existsSync(path.join(OUTPUT, "design-system.json"))) {
    rawData = loadJsonFile(path.join(OUTPUT, "design-system.json"));
    console.log("ℹ️   Loaded Phase 1 output from checkpoint.");
  } else {
    rawData = await extractDesignSystem(page);
  }

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

  // Stabilize layout for screenshots only (after extraction is finished)
  console.log("🧩  Stabilizing layout for screenshot capture…");
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.setAttribute("data-extract-screenshot-style", "1");
    style.textContent = `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
      }
    `;
    document.head.appendChild(style);

    const elements = document.querySelectorAll("*");
    elements.forEach((el) => {
      const node = el as HTMLElement;
      const cs = window.getComputedStyle(node);
      if (cs.position === "fixed" || cs.position === "sticky") {
        node.style.setProperty("position", "absolute", "important");
      }
    });
  });
  await page.waitForTimeout(200);

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
      await loc.evaluate((el: HTMLElement) => {
        el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
      }).catch(() => {});
      await page.waitForTimeout(100);
      if (await loc.count() > 0) {
        const fname = `${sec.id}.png`;
        try {
          await loc.screenshot({ path: path.join(SHOTS, fname), type: "png", timeout: 30000, animations: "disabled" });
        } catch {
          const box = await loc.boundingBox();
          if (box && box.width > 10 && box.height > 10) {
            const maxH = Math.min(box.height, 2200);
            await page.screenshot({
              path: path.join(SHOTS, fname),
              type: "png",
              animations: "disabled",
              clip: {
                x: Math.max(0, box.x),
                y: Math.max(0, box.y),
                width: Math.max(10, box.width),
                height: Math.max(10, maxH),
              },
              timeout: 30000,
            });
          }
        }
        const outPath = path.join(SHOTS, fname);
        if (fs.existsSync(outPath)) {
          (sec as any).screenshot = `screenshots/${fname}`;
        }
      }
    } catch {}
  }
  console.log(""); // Newline after progress

  console.log(`📸  Component screenshots (up to 200)…`);
  
  // Create parallel pages if concurrency > 1
  const pages: Page[] = [page];
  
  // Component screenshots
  const typePriority = (type: string) => {
    if (type === "card") return 1;
    if (type === "button") return 2;
    if (type === "media") return 3;
    if (type === "link-arrow") return 4;
    if (type === "navigation") return 5;
    return 10;
  };

  const compsToProcess = [...rawData.components]
    .sort((a: any, b: any) => {
      const p = typePriority(a.type) - typePriority(b.type);
      if (p !== 0) return p;
      return (b.confidence || 0) - (a.confidence || 0);
    });

  let shotCount = 0;
  let compAttempted = 0;
  
  // Use a max concurrency of 1 for DOM-dependent screenshots to prevent Playwright crashes
  // and because the data-extract-id attributes only exist on the main page.
  await runInParallel(compsToProcess, 1, async (comp, workerId) => {
    const p = page;
    compAttempted++;
    try {
      const rect = comp.rect || { width: 0, height: 0 };
      const aspect = (rect.width || 0) / Math.max(1, rect.height || 1);
      if (comp.type === "component") {
        if (rect.height < 28 || aspect > 14 || (rect.width < 40 && rect.height < 40)) {
          return;
        }
      }

      const loc = p.locator(`[data-extract-id="${comp.id}"]`).first();
      const count = await loc.count();
      if (count === 0) {
        // Element lost due to re-render
        return;
      }
      
      // Scroll into view to ensure lazy-loaded or obscured elements can be captured
      await loc.evaluate((el: HTMLElement) => {
        el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
      }).catch(() => {});
      await loc.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
      await p.waitForTimeout(120);

      if (await loc.isVisible({ timeout: 500 })) {
        const box = await waitForStableBoundingBox(loc, p);
        if (box && box.width > 5 && box.height > 5) {
          const fname = `${comp.id}.png`;
          // Constrain visual overflow to avoid random neighboring overlays bleeding into crop
          await loc.evaluate((el: HTMLElement) => {
            el.dataset.extractPrevOverflow = el.style.overflow || "";
            el.style.overflow = "hidden";
          }).catch(() => {});

          try {
            await loc.screenshot({ path: path.join(SHOTS, fname), type: "png", timeout: 5000, animations: "disabled" });
          } finally {
            await loc.evaluate((el: HTMLElement) => {
              const prev = el.dataset.extractPrevOverflow || "";
              el.style.overflow = prev;
              delete el.dataset.extractPrevOverflow;
            }).catch(() => {});
          }

          const shotPath = `screenshots/${fname}`;
          (comp as any).screenshot = shotPath;
          shotCount++;
        }
      }
    } catch (err) {}
    process.stdout.write(`\r    ↳ Attempting component ${compAttempted}/${compsToProcess.length} (Captured: ${shotCount})`);
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

  // ── Checkpoint save after Phase 1 (before vision loop / AI analysis) ──
  // This guarantees output is on disk even if later phases timeout or fail.
  const jsonPath = path.join(OUTPUT, "design-system.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ ...rawData, analysis: null }, null, 2));
  console.log(`\n💾  Phase 1 checkpoint saved → ${jsonPath}`);

  // ══════════════════════════════════════════════
  // PHASE 1.5: VISION LOOP INTEGRATION
  // ══════════════════════════════════════════════

  const gemini = new GeminiClient();
  if (gemini.isAvailable) {
    console.log("\n👁️  Phase 1.5: AI Vision Extraction Pass…");

    // Clean up stale agent-browser sockets from previous failed runs
    const abDir = path.join(os.homedir(), ".agent-browser");
    for (const ext of ["sock", "pid"]) {
      const f = path.join(abDir, `harvest.${ext}`);
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }

    const driver = new AgentDriver("harvest");
    console.log("    ↳ Starting Agent-Browser and navigating to page...");
    try {
      console.log("    ↳ Opening page in Agent-Browser...");
      await driver.open(url);

      console.log("    ↳ Page opened, waiting for network to go idle...");
      await driver.waitLoad("networkidle");

      console.log("    ↳ Network settled, waiting 3s for final layout stabilization...");
      await driver.wait(3000);

      console.log("    ↳ Entering multi-viewport vision loop...");
      
      const visionComps = await runVisionLoop(driver, gemini, url, OUTPUT, SHOTS);
      if (visionComps && visionComps.length > 0) {
        rawData.components.push(...visionComps);
        console.log(`    ↳ Added ${visionComps.length} high-quality components from Vision Agent`);
      }
    } catch (e) {
      console.warn("    ⚠️  Vision extraction pass failed:", (e as Error).message);
    } finally {
      await driver.close();
    }
  } else {
    console.log("\n⏭️   Skipping Vision extraction pass (no GOOGLE_CLOUD_API_KEY)\n");
  }

  // ══════════════════════════════════════════════
  // PHASE 2: DESIGN MEMORY GENERATION
  // ══════════════════════════════════════════════

  let analysis: any = null;

  if (gemini.isAvailable) {
    const runMemory = await shouldRunMemory(args);

    if (runMemory) {
      console.log("\n🤖  Phase 2: Design Memory Generation (Gemini)…\n");
      try {
        const memoryGen = new MemoryGenerator(gemini, rawData, OUTPUT);
        const memoryResult = await memoryGen.generateAll();

        analysis = {
          memoryOutputs: memoryResult.dir,
          aiUsage: {
            calls: gemini.calls,
            tokens: gemini.usage.totalTokens,
          }
        };

        console.log(`\n  ✅  Design Memory complete`);
        console.log(`      API calls: ${analysis.aiUsage.calls}`);
        console.log(`      Tokens:    ${analysis.aiUsage.tokens?.toLocaleString() || 'Unknown'}`);
        console.log(`      Output:    ${analysis.memoryOutputs}`);
      } catch (err) {
        console.error("  ❌  Design Memory generation failed:", (err as Error).message);
      }
    } else {
      console.log("\n⏭️   Skipping design memory generation (--no-memory or user chose no)\n");
    }
  } else {
    console.log("\n⏭️   Skipping design memory generation (no GOOGLE_CLOUD_API_KEY set)\n");
  }

  // ── Combine & Save ──
  const finalData = {
    ...rawData,
    analysis: analysis || null,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(finalData, null, 2));
  console.log(`\n✅  Saved → ${jsonPath}`);

  // ── Start Server ──
  if (!noServe) {
    startServer(finalData, OUTPUT, ROOT);
  } else {
    console.log("ℹ️   Skipping API server start (--no-serve).");
  }
}

main().catch((err) => {
  console.error("❌  Fatal error:", err);
  process.exit(1);
});
