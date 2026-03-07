// ** import core packages
import fs from "node:fs";
import path from "node:path";

// ** import apis
import { startServer } from "./server.js";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "output");
const dataPath = path.join(OUTPUT, "design-system.json");
const viteUrlArg = process.argv.find((arg) => arg.startsWith("--vite-url="));
const viteUrl = viteUrlArg?.slice("--vite-url=".length);

if (!fs.existsSync(dataPath)) {
  console.error("❌ No extracted data found. Run the extractor first.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
startServer(data, OUTPUT, ROOT, { viteUrl });
