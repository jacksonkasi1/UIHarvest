// ** import core packages
import express from "express";
import fs from "node:fs";
import path from "node:path";

// ** import types
interface ServerOptions {
  viteUrl?: string;
}

interface MemoryDocumentItem {
  path: string;
  name: string;
  title: string;
  size: number;
}

interface MemoryGroup {
  id: string;
  label: string;
  items: MemoryDocumentItem[];
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\.md$/i, "")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function docWeight(name: string): number {
  const order = [
    "INSTRUCTIONS.md",
    "principles.md",
    "style.md",
    "layout.md",
    "components.md",
    "motion.md",
    "reference.md",
    "qa.md",
  ];
  const index = order.indexOf(name);
  return index === -1 ? order.length + 1 : index;
}

function buildMemoryIndex(outputDir: string): { available: boolean; groups: MemoryGroup[] } {
  const memoryRoot = path.join(outputDir, ".design-memory");
  if (!fs.existsSync(memoryRoot)) {
    return { available: false, groups: [] };
  }

  const groups = new Map<string, MemoryGroup>();

  const ensureGroup = (id: string, label: string): MemoryGroup => {
    const existing = groups.get(id);
    if (existing) return existing;
    const group = { id, label, items: [] };
    groups.set(id, group);
    return group;
  };

  const walk = (dirPath: string, prefix = ""): void => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(dirPath, entry.name);
      const relPath = prefix ? path.posix.join(prefix, entry.name) : entry.name;

      if (entry.isDirectory()) {
        walk(absPath, relPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

      const segments = relPath.split("/");
      const groupId = segments.length === 1 ? "core" : segments[0] ?? "core";
      const groupLabel = groupId === "core" ? "Memory" : titleCase(groupId);
      const group = ensureGroup(groupId, groupLabel);
      const stat = fs.statSync(absPath);

      group.items.push({
        path: relPath,
        name: entry.name,
        title: titleCase(entry.name),
        size: stat.size,
      });
    }
  };

  walk(memoryRoot);

  const sortedGroups = Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => {
        const weightDiff = docWeight(a.name) - docWeight(b.name);
        return weightDiff !== 0 ? weightDiff : a.title.localeCompare(b.title);
      }),
    }))
    .sort((a, b) => {
      if (a.id === "core") return -1;
      if (b.id === "core") return 1;
      return a.label.localeCompare(b.label);
    });

  return { available: sortedGroups.some((group) => group.items.length > 0), groups: sortedGroups };
}

function resolveMemoryFile(outputDir: string, requestedPath: string): string | null {
  const memoryRoot = path.join(outputDir, ".design-memory");
  if (!requestedPath) return null;

  const resolved = path.resolve(memoryRoot, requestedPath);
  if (!resolved.startsWith(`${memoryRoot}${path.sep}`) && resolved !== memoryRoot) {
    return null;
  }

  if (!resolved.endsWith(".md") || !fs.existsSync(resolved)) {
    return null;
  }

  return resolved;
}

export function startServer(data: any, outputDir: string, rootDir: string, options: ServerOptions = {}) {
  const app = express();
  const initialPort = Number(process.env.PORT || 3333);

  app.use("/output", express.static(outputDir));

  app.get("/api/design-system", (_req, res) => {
    res.json(data);
  });

  app.get("/api/memory", (_req, res) => {
    res.json(buildMemoryIndex(outputDir));
  });

  app.get("/api/memory/content", (req, res) => {
    const requestedPath = String(req.query.path ?? "");
    const filePath = resolveMemoryFile(outputDir, requestedPath);
    if (!filePath) {
      res.status(404).json({ message: "Memory document not found" });
      return;
    }

    res.json({
      path: requestedPath,
      content: fs.readFileSync(filePath, "utf-8"),
    });
  });

  const listen = (port: number) => {
    const server = app.listen(port, () => {
      console.log(`\n🧩  API server → http://localhost:${port}`);
      if (options.viteUrl) {
        console.log(`🌐  Vite explorer → ${options.viteUrl}\n`);
      } else {
        console.log("ℹ️   Start the Vite explorer separately with `bun run web` or `bun run --cwd web dev`.\n");
      }
    });

    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.log(`⚠️  Port ${port} is in use, trying ${port + 1}...`);
        listen(port + 1);
        return;
      }

      console.error("❌ Failed to start server:", err);
      process.exit(1);
    });
  };

  listen(initialPort);
}
