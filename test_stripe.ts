import { chromium } from "playwright";
import { extractDesignSystem } from "./src/extractor.js";
import fs from "fs";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://stripe.com/in", { waitUntil: "networkidle", timeout: 60000 });
  
  const data = await extractDesignSystem(page);
  
  console.log("Waiting 5 seconds...");
  await page.waitForTimeout(5000);
  
  // Count how many have data-extract-id
  const hasAttrCount = await page.evaluate(() => document.querySelectorAll("[data-extract-id]").length);
  console.log(`Elements with data-extract-id: ${hasAttrCount}`);
  
  let visCount = 0;
  for (const c of data.components) {
    const isVis = await page.locator(`[data-extract-id="${c.id}"]`).first().isVisible();
    if (isVis) visCount++;
  }
  console.log(`Visible components: ${visCount}/${data.components.length}`);

  await browser.close();
})();
