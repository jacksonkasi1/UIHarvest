// ** import core packages
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ** import apis
import { JobManager } from "./job-manager.js";
import { streamTarGz } from "./zip-builder.js";
import { discoverPages } from "./extract-pipeline.js";
import { RemixManager } from "./remix/remix-manager.js";

// ** import types
import type { ProgressEvent } from "./extract-pipeline.js";
import type { RemixProgressEvent } from "./remix/types.js";

// ** import apis (chat)
import { handleChatMessage } from "./remix/chat-handler.js";

// ════════════════════════════════════════════════════
// MEMORY INDEX HELPERS (preserved from original)
// ════════════════════════════════════════════════════

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

function buildMemoryIndex(outputDir: string): {
  available: boolean;
  groups: MemoryGroup[];
} {
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
      const relPath = prefix
        ? path.posix.join(prefix, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        walk(absPath, relPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

      const segments = relPath.split("/");
      const groupId =
        segments.length === 1 ? "core" : segments[0] ?? "core";
      const groupLabel =
        groupId === "core" ? "Memory" : titleCase(groupId);
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
        return weightDiff !== 0
          ? weightDiff
          : a.title.localeCompare(b.title);
      }),
    }))
    .sort((a, b) => {
      if (a.id === "core") return -1;
      if (b.id === "core") return 1;
      return a.label.localeCompare(b.label);
    });

  return {
    available: sortedGroups.some((group) => group.items.length > 0),
    groups: sortedGroups,
  };
}

function resolveMemoryFile(
  outputDir: string,
  requestedPath: string
): string | null {
  const memoryRoot = path.join(outputDir, ".design-memory");
  if (!requestedPath) return null;

  const resolved = path.resolve(memoryRoot, requestedPath);
  if (
    !resolved.startsWith(`${memoryRoot}${path.sep}`) &&
    resolved !== memoryRoot
  ) {
    return null;
  }

  if (!resolved.endsWith(".md") || !fs.existsSync(resolved)) {
    return null;
  }

  return resolved;
}

// ════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ════════════════════════════════════════════════════

const SITE_PASSWORD = process.env.SITE_PASSWORD || "";
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_COOKIE = "uih_session";

function generateSessionToken(): string {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update("authenticated")
    .digest("hex");
}

function isValidSession(token: string): boolean {
  return token === generateSessionToken();
}

function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  // No password set → skip auth
  if (!SITE_PASSWORD) {
    next();
    return;
  }

  const token = req.cookies?.[SESSION_COOKIE];
  if (token && isValidSession(token)) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}

// ════════════════════════════════════════════════════
// SSE RECONNECT INTERVAL
// ════════════════════════════════════════════════════

const SSE_RECONNECT_MS = 55 * 60 * 1000; // 55 minutes

// ════════════════════════════════════════════════════
// SERVER
// ════════════════════════════════════════════════════

/**
 * Start the unified server.
 *
 * When called from CLI (with data + outputDir), it also serves the
 * legacy /api/design-system and /api/memory endpoints.
 *
 * When called standalone (web mode), it serves the compiled frontend
 * and provides the extraction job API.
 */
export function startServer(
  data?: any,
  outputDir?: string,
  rootDir?: string
) {
  const app = express();
  const port = Number(process.env.PORT || 3333);
  const jobManager = new JobManager();
  const remixManager = new RemixManager();

  app.use(express.json({ limit: "50mb" }));
  app.use(cookieParser());

  // WebContainer requires cross-origin isolation (SharedArrayBuffer)
  app.use((_req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
  });

  // ── Auth endpoints ──────────────────────────────────────────────────

  app.get("/api/auth/status", (_req, res) => {
    res.json({
      requiresPassword: !!SITE_PASSWORD,
      authenticated: !SITE_PASSWORD || isValidSession(_req.cookies?.[SESSION_COOKIE] || ""),
    });
  });

  app.post("/api/login", (req, res) => {
    if (!SITE_PASSWORD) {
      res.json({ success: true });
      return;
    }

    const { password } = req.body;
    if (password === SITE_PASSWORD) {
      const token = generateSessionToken();
      res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  });

  // ── Extraction API (protected) ────────────────────────────────────

  app.post("/api/extract/discover", authMiddleware, async (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "URL is required" });
      return;
    }

    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    try {
      const pages = await discoverPages(url);
      res.json({ pages });
    } catch (err) {
      res.status(500).json({ error: `Discovery failed: ${(err as Error).message}` });
    }
  });

  app.post("/api/extract", authMiddleware, (req, res) => {
    const { url, runMemory, pages } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "URL is required" });
      return;
    }

    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    const job = jobManager.create(url, runMemory ?? false, pages);
    res.json({ jobId: job.id, status: job.status });
  });

  app.get("/api/extract/:id/status", authMiddleware, (req, res) => {
    const job = jobManager.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const lastEvent =
      job.events.length > 0
        ? job.events[job.events.length - 1]
        : null;

    res.json({
      id: job.id,
      url: job.url,
      status: job.status,
      lastEvent,
    });
  });

  app.get("/api/extract/:id/progress", authMiddleware, (req, res) => {
    const job = jobManager.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send a keep-alive comment every 15 seconds
    const keepAlive = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 15_000);

    // Reconnect signal before GCR 60-min timeout
    const reconnectTimer = setTimeout(() => {
      res.write(
        `data: ${JSON.stringify({ phase: "reconnect", message: "Reconnect to continue streaming" })}\n\n`
      );
    }, SSE_RECONNECT_MS);

    const listener = (event: ProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = jobManager.subscribe(job.id, listener);

    req.on("close", () => {
      clearInterval(keepAlive);
      clearTimeout(reconnectTimer);
      if (unsubscribe) unsubscribe();
    });
  });

  app.get("/api/extract/:id/result", authMiddleware, (req, res) => {
    const job = jobManager.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (job.status !== "done") {
      res.status(202).json({ status: job.status, message: "Job still in progress" });
      return;
    }

    if (!job.result || !job.result.data) {
      res.status(500).json({ error: "Job completed but no result data" });
      return;
    }

    res.json(job.result.data);
  });

  app.get("/api/extract/:id/download", authMiddleware, async (req, res) => {
    const job = jobManager.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    if (job.status !== "done") {
      res.status(202).json({ status: job.status, message: "Job still in progress" });
      return;
    }

    try {
      const archiveName = `uiharvest-${job.id}`;
      await streamTarGz(job.outputDir, archiveName, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create archive" });
      }
    }
  });

  app.get("/api/extract/:id/memory", authMiddleware, (req, res) => {
    const job = jobManager.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(buildMemoryIndex(job.outputDir));
  });

  app.get("/api/extract/:id/memory/content", authMiddleware, (req, res) => {
    const job = jobManager.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const requestedPath = String(req.query.path ?? "");
    const filePath = resolveMemoryFile(job.outputDir, requestedPath);
    if (!filePath) {
      res.status(404).json({ message: "Memory document not found" });
      return;
    }

    res.json({
      path: requestedPath,
      content: fs.readFileSync(filePath, "utf-8"),
    });
  });

  // Serve job static output (screenshots, assets, fonts)
  app.use("/api/extract/:id/output", authMiddleware, (req, res, next) => {
    const job = jobManager.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    express.static(job.outputDir)(req, res, next);
  });

  // ── Remix API (protected) ─────────────────────────────────────────────

  app.post("/api/remix", authMiddleware, (req, res) => {
    const { referenceUrl, targetUrl, brandOverrides, prompt } = req.body;

    if (!referenceUrl && !prompt) {
      res.status(400).json({ error: "referenceUrl or prompt is required" });
      return;
    }

    if (referenceUrl) {
      try {
        new URL(referenceUrl);
        if (targetUrl) new URL(targetUrl);
      } catch {
        res.status(400).json({ error: "Invalid URL" });
        return;
      }
    }

    const job = remixManager.create({ referenceUrl, targetUrl, brandOverrides, initialPrompt: prompt });
    res.json({ jobId: job.id, status: job.status, phase: job.phase });
  });

  app.get("/api/remix/:id/progress", authMiddleware, (req, res) => {
    const job = remixManager.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Remix job not found" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const keepAlive = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 15_000);

    const listener = (event: RemixProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = remixManager.subscribe(job.id, listener);

    req.on("close", () => {
      clearInterval(keepAlive);
      if (unsubscribe) unsubscribe();
    });
  });

  app.get("/api/remix/:id/files", authMiddleware, (req, res) => {
    const job = remixManager.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Remix job not found" });
      return;
    }

    if (job.status !== "done" && job.phase !== "ready") {
      res.status(202).json({ status: job.status, phase: job.phase, message: "Still generating" });
      return;
    }

    res.json({ files: job.files, spec: job.result?.spec });
  });

  app.post("/api/remix/:id/iterate", authMiddleware, async (req, res) => {
    const { prompt, images } = req.body;
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    // images is optional: array of { data: base64string, mimeType: string }
    const imageAttachments = Array.isArray(images) ? images.slice(0, 5) : undefined;

    const files = await remixManager.iterate(req.params.id, prompt, imageAttachments);
    if (!files) {
      res.status(404).json({ error: "Job not found or not ready" });
      return;
    }

    res.json({ files });
  });

  // ── Streaming Chat API (SSE) ───────────────────────────────────────────────
  app.post("/api/remix/:id/chat", authMiddleware, async (req, res) => {
    const { prompt, images } = req.body;
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const chatDeps = remixManager.getChatDeps(req.params.id);
    if (!chatDeps) {
      res.status(404).json({ error: "Job not found or not ready" });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send initial SSE comment to prime the connection
    res.write(": connected\n\n");

    // Keepalive to prevent proxy timeout
    const keepAlive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": keep-alive\n\n");
      }
    }, 15_000);

    // Abort controller for stop/cancel
    const controller = new AbortController();
    req.on("close", () => {
      clearInterval(keepAlive);
      controller.abort();
    });

    const imageAttachments = Array.isArray(images) ? images.slice(0, 5) : undefined;

    try {
      await handleChatMessage(
        res,
        prompt,
        imageAttachments,
        chatDeps,
        controller.signal
      );
    } catch (err) {
      console.error("[chat-endpoint] Error:", (err as Error).message);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: "error", error: (err as Error).message })}\n\n`);
      }
    }

    clearInterval(keepAlive);
    if (!res.writableEnded) {
      res.end();
    }
  });

  app.get("/api/remix/:id/status", authMiddleware, (req, res) => {
    const job = remixManager.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Remix job not found" });
      return;
    }

    res.json({
      id: job.id,
      status: job.status,
      phase: job.phase,
      referenceUrl: job.referenceUrl,
      targetUrl: job.targetUrl,
      fileCount: job.files.length,
    });
  });

  // ── Legacy CLI endpoints (backward-compat) ──────────────────────────

  if (data && outputDir) {
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
  }

  // ── Serve compiled web frontend ─────────────────────────────────────

  const webDistDir = path.resolve(
    rootDir || process.cwd(),
    "web",
    "dist"
  );

  if (fs.existsSync(webDistDir)) {
    app.use(express.static(webDistDir));

    // SPA fallback: all non-API routes serve index.html
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(webDistDir, "index.html"));
    });
  }

  // ── Start listening ─────────────────────────────────────────────────

  const listen = (p: number) => {
    const server = app.listen(p, () => {
      console.log(`\n🧩  UIHarvest server → http://localhost:${p}`);
    });

    server.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        console.log(`⚠️  Port ${p} in use, trying ${p + 1}…`);
        listen(p + 1);
        return;
      }
      console.error("❌ Failed to start server:", err);
      process.exit(1);
    });
  };

  listen(port);
}
