import { chromium } from "playwright";
import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { extractDesignSystem } from "./extractor.js";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "output");
const SHOTS = path.join(OUTPUT, "screenshots");
const ASSETS = path.join(OUTPUT, "assets");
const FONTS = path.join(OUTPUT, "fonts");

function ensureDirs() {
  [OUTPUT, SHOTS, ASSETS, FONTS].forEach((d) => fs.mkdirSync(d, { recursive: true }));
}

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${url}`);
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

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
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
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  } catch {
    console.log("⚠️   networkidle timeout, continuing…");
  }
  await page.waitForTimeout(2000);

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
  const data = await extractDesignSystem(page);

  // Summary
  const compTypes: Record<string, number> = {};
  data.components.forEach((c: any) => {
    const key = `${c.type}/${c.subType}`;
    compTypes[key] = (compTypes[key] || 0) + 1;
  });
  console.log("\n📊  Extraction Summary:");
  console.log(`    Colors:      ${data.tokens.colors.length}`);
  console.log(`    Gradients:   ${data.tokens.gradients.length}`);
  console.log(`    Typography:  ${data.tokens.typography.length}`);
  console.log(`    Spacing:     ${data.tokens.spacing.length}`);
  console.log(`    Radii:       ${data.tokens.radii.length}`);
  console.log(`    Shadows:     ${data.tokens.shadows.length}`);
  console.log(`    Borders:     ${data.tokens.borders.length}`);
  console.log(`    Transitions: ${data.tokens.transitions.length}`);
  console.log(`    Components:  ${data.components.length}`);
  Object.entries(compTypes).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`      ${k}: ${v}`);
  });
  console.log(`    Patterns:    ${data.patterns.length}`);
  console.log(`    Sections:    ${data.sections.length}`);
  console.log(`    Images:      ${data.assets.images.length}`);
  console.log(`    SVGs:        ${data.assets.svgs.length}`);
  console.log(`    Videos:      ${data.assets.videos.length}`);
  console.log(`    Pseudos:     ${data.assets.pseudoElements.length}`);
  console.log(`    Hovers:      ${data.interactions.hoverStates.length}`);
  console.log(`    CSS Vars:    ${data.cssVariables.length}`);
  console.log(`    Font Files:  ${fontFiles.length}`);
  console.log(`    Font Faces:  ${data.fontFaces.length}`);
  console.log(`    Containers:  ${data.layoutSystem.containerWidths.join(", ")}px`);

  // Full page screenshot
  console.log("\n📸  Screenshots…");
  await page.screenshot({ path: path.join(SHOTS, "full-page.png"), fullPage: true, type: "png" });
  (data as any).fullPageScreenshot = "screenshots/full-page.png";

  // Section screenshots
  for (const sec of data.sections) {
    try {
      const loc = page.locator(`[data-extract-id="${sec.id}"]`).first();
      if (await loc.isVisible({ timeout: 300 })) {
        const fname = `${sec.id}.png`;
        await loc.screenshot({ path: path.join(SHOTS, fname), type: "png" });
        (sec as any).screenshot = `screenshots/${fname}`;
      }
    } catch {}
  }

  // Component screenshots
  const seenSig = new Set<string>();
  let shotCount = 0;
  for (const comp of data.components) {
    if (shotCount > 200) break;
    const sigKey = `${comp.type}|${comp.subType}|${comp.signature}`;
    if (seenSig.has(sigKey)) continue;
    seenSig.add(sigKey);
    try {
      const loc = page.locator(`[data-extract-id="${comp.id}"]`).first();
      if (await loc.isVisible({ timeout: 300 })) {
        const box = await loc.boundingBox();
        if (box && box.width > 5 && box.height > 5) {
          const fname = `${comp.id}.png`;
          await loc.screenshot({ path: path.join(SHOTS, fname), type: "png" });
          (comp as any).screenshot = `screenshots/${fname}`;
          shotCount++;
        }
      }
    } catch {}
  }

  // Hover state screenshots
  console.log("📸  Hover screenshots…");
  for (const hover of data.interactions.hoverStates) {
    try {
      const loc = page.locator(`[data-extract-id="${hover.componentId}"]`).first();
      if (await loc.isVisible({ timeout: 300 })) {
        await loc.hover({ timeout: 500 });
        await page.waitForTimeout(350);
        const fname = `${hover.componentId}-hover.png`;
        await loc.screenshot({ path: path.join(SHOTS, fname), type: "png" });
        hover.screenshotHover = `screenshots/${fname}`;
        await page.mouse.move(0, 0);
        await page.waitForTimeout(200);
      }
    } catch {}
  }

  // Download image assets
  console.log("📦  Downloading assets…");
  for (let i = 0; i < Math.min(data.assets.images.length, 80); i++) {
    const img = data.assets.images[i];
    try {
      const resp = await page.request.get(img.src, { timeout: 8000 });
      if (resp.ok()) {
        const ct = resp.headers()["content-type"] || "";
        let ext = "png";
        if (ct.includes("jpeg") || ct.includes("jpg")) ext = "jpg";
        else if (ct.includes("webp")) ext = "webp";
        else if (ct.includes("svg")) ext = "svg";
        else if (ct.includes("gif")) ext = "gif";
        const fname = `image-${i}.${ext}`;
        fs.writeFileSync(path.join(ASSETS, fname), await resp.body());
        (img as any).localPath = `assets/${fname}`;
      }
    } catch {}
  }

  // Save SVGs
  for (let i = 0; i < Math.min(data.assets.svgs.length, 80); i++) {
    const svg = data.assets.svgs[i];
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
    if (data.fontFaces[i]) (data.fontFaces[i] as any).localPath = `fonts/${fname}`;
  }

  // Save JSON
  const jsonPath = path.join(OUTPUT, "design-system.json");
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  console.log(`\n✅  Saved → ${jsonPath}`);

  await browser.close();
  startServer(data);
}

function startServer(data: any) {
  const app = express();
  const PORT = 3333;
  app.use("/output", express.static(OUTPUT));
  app.use(express.static(path.join(ROOT, "public")));
  app.get("/api/design-system", (_req, res) => res.json(data));
  app.listen(PORT, () => {
    const url2 = `http://localhost:${PORT}`;
    console.log(`\n🎨  Design Explorer → ${url2}\n`);
    openBrowser(url2);
  });
}

main().catch((err) => {
  console.error("❌  Fatal error:", err);
  process.exit(1);
});