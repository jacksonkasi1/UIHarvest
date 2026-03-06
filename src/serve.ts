import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "output");

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} ${url}`);
}

const dataPath = path.join(OUTPUT, "design-system.json");

if (!fs.existsSync(dataPath)) {
  console.error("❌ No extracted data found. Run the extractor first.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

const app = express();
const PORT = 3333;

app.use("/output", express.static(OUTPUT));
app.use(express.static(path.join(ROOT, "public"))); // Serve the HTML UI instead of web/dist

app.get("/api/design-system", (_req, res) => {
  res.json(data);
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n🎨  Design Explorer serving saved data → ${url}\n`);
  openBrowser(url);
});
