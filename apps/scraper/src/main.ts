import "dotenv/config";

// ** import core packages
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// ** import utils
import path from "path";
import fs from "fs";

// ** import apis
import { runExtraction } from "./extract-pipeline.js";
import { startServer } from "./server.js";

// ** import types
import type { ProgressEvent } from "./extract-pipeline.js";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "output");

// ════════════════════════════════════════════════════
// CLI HELPERS
// ════════════════════════════════════════════════════

function normalizeUrl(input: string): string {
  try {
    const parsed = new URL(input);
    parsed.hash = "";
    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
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

async function shouldCleanOutput(
  force: boolean,
  targetUrl: string,
  resume: boolean
): Promise<boolean> {
  if (force) return true;
  if (!fs.existsSync(OUTPUT)) return false;

  const files = fs.readdirSync(OUTPUT);
  if (files.length === 0) return false;

  const dataPath = path.join(OUTPUT, "design-system.json");
  let existingData: any = null;
  if (fs.existsSync(dataPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
    } catch { }
  }
  const existingUrl = existingData?.meta?.url as string | undefined;

  if (resume) {
    if (!existingData) {
      console.error(
        "❌ --resume requested but no existing output checkpoint was found."
      );
      process.exit(1);
    }
    if (existingUrl && !urlsMatch(existingUrl, targetUrl)) {
      console.error(
        `❌ --resume target mismatch. Existing output is for ${existingUrl}. Use --force to replace it.`
      );
      process.exit(1);
    }
    console.log(
      `ℹ️   Resuming existing output for ${existingUrl || targetUrl}.`
    );
    return false;
  }

  if (existingUrl && !urlsMatch(existingUrl, targetUrl)) {
    const warning = `⚠️   Existing output belongs to ${existingUrl}, not ${targetUrl}.`;
    if (!process.stdin.isTTY) {
      console.error(
        `${warning}\nUse --force to clean old output before switching sites.`
      );
      process.exit(1);
    }
    const rl = readline.createInterface({ input, output });
    try {
      const answer = await rl.question(
        "🧹  Output is for a different site. Clean output folder before run? (Y/n): "
      );
      return (
        answer.trim() === "" ||
        answer.trim().toLowerCase() === "y" ||
        answer.trim().toLowerCase() === "yes"
      );
    } finally {
      rl.close();
    }
  }

  if (!process.stdin.isTTY) {
    console.log(
      "ℹ️   Existing output detected for the same site. Keeping existing files."
    );
    return false;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(
      "🧹  Existing output found. Clean output folder before run? (y/N): "
    );
    return (
      answer.trim().toLowerCase() === "y" ||
      answer.trim().toLowerCase() === "yes"
    );
  } finally {
    rl.close();
  }
}

async function shouldRunMemory(args: string[]): Promise<boolean> {
  if (args.includes("--memory")) return true;
  if (args.includes("--no-memory")) return false;
  if (!process.stdin.isTTY) return false;

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(
      "🧠  Run design-memory generation? (Y/n): "
    );
    const trimmed = answer.trim().toLowerCase();
    return trimmed === "" || trimmed === "y" || trimmed === "yes";
  } finally {
    rl.close();
  }
}

// ════════════════════════════════════════════════════
// MAIN CLI
// ════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const forceClean = args.includes("-f") || args.includes("--force");
  const noServe = args.includes("--no-serve");
  const resume = args.includes("--resume");
  const url = args.find((arg) => !arg.startsWith("-"));

  if (!url) {
    console.error("\n  Usage:  npm start <url>\n");
    console.error(
      "  Example:  npm start https://asana.com/features/project-management -- --force\n"
    );
    process.exit(1);
  }

  if (await shouldCleanOutput(forceClean, url, resume)) {
    if (fs.existsSync(OUTPUT)) {
      fs.rmSync(OUTPUT, { recursive: true, force: true });
    }
    console.log("🧹  Cleaned existing output folder.");
  }

  console.log(`\n🔍  Target: ${url}\n`);

  const runMemory = await shouldRunMemory(args);

  // ── Progress logger for CLI ───────────────────────────────────────────
  const onProgress = (event: ProgressEvent) => {
    const prefix =
      event.phase === "error"
        ? "❌"
        : event.phase === "done"
          ? "✅"
          : "📡";
    const pct =
      event.progress !== undefined ? ` [${event.progress}%]` : "";
    console.log(`${prefix}${pct}  ${event.message}`);

    if (event.phase === "done" && event.summary) {
      console.log("\n📊  Extraction Summary:");
      const s = event.summary;
      console.log(`    Colors:      ${s.colors}`);
      console.log(`    Gradients:   ${s.gradients}`);
      console.log(`    Typography:  ${s.typography}`);
      console.log(`    Spacing:     ${s.spacing}`);
      console.log(`    Radii:       ${s.radii}`);
      console.log(`    Shadows:     ${s.shadows}`);
      console.log(`    Borders:     ${s.borders}`);
      console.log(`    Transitions: ${s.transitions}`);
      console.log(`    Components:  ${s.components}`);
      console.log(`    Patterns:    ${s.patterns}`);
      console.log(`    Sections:    ${s.sections}`);
      console.log(`    Images:      ${s.images}`);
      console.log(`    SVGs:        ${s.svgs}`);
      console.log(`    Videos:      ${s.videos}`);
      console.log(`    Pseudos:     ${s.pseudoElements}`);
      console.log(`    Hovers:      ${s.hoverStates}`);
      console.log(`    CSS Vars:    ${s.cssVariables}`);
      console.log(`    Font Files:  ${s.fontFiles}`);
      console.log(`    Font Faces:  ${s.fontFaces}`);
      console.log(`    Containers:  ${s.containerWidths}`);
    }
  };

  const result = await runExtraction({
    url,
    outputDir: OUTPUT,
    force: forceClean,
    resume,
    runMemory,
    skipVision: false,
    onProgress,
  });

  if (!result.success) {
    console.error(`\n❌  Extraction failed: ${result.error}`);
    process.exit(1);
  }

  console.log(`\n✅  Saved → ${result.jsonPath}`);

  // ── Start Server ──
  if (!noServe) {
    startServer(result.data, OUTPUT, ROOT);
  } else {
    console.log("ℹ️   Skipping API server start (--no-serve).");
  }
}

main().catch((err) => {
  console.error("❌  Fatal error:", err);
  process.exit(1);
});
