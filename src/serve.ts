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

const app = express();
const PORT = process.env.PORT || 3333;

const startServer = (port: number | string) => {
  const server = app.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n🎨  Design Explorer serving saved data → ${url}\n`);
    openBrowser(url);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.log(`⚠️  Port ${port} is in use, trying ${Number(port) + 1}...`);
      startServer(Number(port) + 1);
    } else {
      console.error("❌ Failed to start server:", err);
      process.exit(1);
    }
  });
};

startServer(PORT);
