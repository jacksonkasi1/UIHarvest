// ** import core packages
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ** import apis
import { JobManager } from "./job-manager.js";
import { streamTarGz } from "./zip-builder.js";
import { discoverPages } from "./extract-pipeline.js";
import { appConfig, isProduction } from "./config.js";
import {
  listJobRecords,
  getJobRecord,
  deleteJobRecord,
  updateJobStatus,
} from "./firestore-store.js";
import {
  readFileFromGCS,
  downloadJobDir,
  deleteJobFromGCS,
  jobExistsInGCS,
  streamFileToResponse,
} from "./gcs-store.js";

// ** import types
import type { ProgressEvent } from "./extract-pipeline.js";

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
  const memoryRoot = path.join(outputDir, "design-memory");
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
  const memoryRoot = path.join(outputDir, "design-memory");
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

/**
 * Resolve outputDir for a job:
 *  1. In-process job map
 *  2. Ephemeral disk (tmpdir) — same instance, job evicted from map
 *  3. Returns null (caller should fall back to GCS)
 */
function getOutputDirForJob(jobManager: JobManager, jobId: string): string | null {
  const job = jobManager.get(jobId);
  if (job) return job.outputDir;

  const fallbackDir = path.join(os.tmpdir(), `uiharvest-job-${jobId}`);
  if (fs.existsSync(fallbackDir)) return fallbackDir;

  return null;
}

/**
 * Ensure a job's output is available locally — first tries in-memory/disk,
 * then downloads from GCS into tmpdir if needed.
 * Returns the local outputDir string, or null if nowhere to be found.
 */
async function resolveOutputDir(
  jobManager: JobManager,
  jobId: string
): Promise<string | null> {
  const local = getOutputDirForJob(jobManager, jobId);
  if (local) return local;

  // Try GCS
  const localDir = path.join(os.tmpdir(), `uiharvest-job-${jobId}`);
  const downloaded = await downloadJobDir(jobId, localDir).catch(() => null);
  return downloaded;
}

// ════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ════════════════════════════════════════════════════

const SITE_PASSWORD = appConfig.sitePassword;
const SESSION_SECRET = appConfig.sessionSecret;
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
 */
export function startServer(
  data?: any,
  outputDir?: string,
  rootDir?: string
) {
  const app = express();
  const port = appConfig.port;
  const jobManager = new JobManager();

  app.use(express.json({ limit: "50mb" }));
  app.use(cookieParser());

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
        secure: isProduction(),
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  });

  app.post("/api/logout", (req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ success: true });
  });

  // ── Jobs list (Firestore) ─────────────────────────────────────────

  app.get("/api/jobs", authMiddleware, async (_req, res) => {
    try {
      const jobs = await listJobRecords();
      res.json({ jobs });
    } catch (err) {
      res.status(500).json({ error: `Failed to list jobs: ${(err as Error).message}` });
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
    const { url, pages } = req.body;
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

    const job = jobManager.create(url, true, pages);
    res.json({ jobId: job.id, status: job.status });
  });

  app.get("/api/extract/:id/status", authMiddleware, async (req, res) => {
    const job = jobManager.get(req.params.id);

    if (job) {
      const lastEvent =
        job.events.length > 0
          ? job.events[job.events.length - 1]
          : null;
      res.json({ id: job.id, url: job.url, status: job.status, lastEvent });
      return;
    }

    // Disk fallback
    const fallbackDir = path.join(os.tmpdir(), `uiharvest-job-${req.params.id}`);
    if (fs.existsSync(fallbackDir) && (fs.existsSync(path.join(fallbackDir, "design-system.json")) || fs.existsSync(path.join(fallbackDir, "extraction.json")))) {
      res.json({ id: req.params.id, status: "done", lastEvent: { phase: "done", message: "Recovered from disk" } });
      return;
    }

    // Firestore / GCS fallback
    try {
      const record = await getJobRecord(req.params.id);
      if (record) {
        // If Firestore says "running" but job is not in memory, the instance
        // was killed (scale-to-zero). Mark it as error so UI doesn't spin forever.
        if (record.status === "running") {
          await updateJobStatus(req.params.id, "error").catch(() => {});
          res.json({ id: record.id, url: record.url, status: "error", lastEvent: { phase: "error", message: "Job was interrupted (instance restarted)" } });
          return;
        }
        res.json({ id: record.id, url: record.url, status: record.status, lastEvent: { phase: record.status, message: `Recovered from Firestore: ${record.status}` } });
        return;
      }
    } catch { /* ignore */ }

    res.status(404).json({ error: "Job not found" });
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
    let keepAlive: NodeJS.Timeout | null = null;
    if (job.status !== "done" && job.status !== "error") {
      keepAlive = setInterval(() => {
        res.write(": keep-alive\n\n");
      }, 15_000);
    }

    // Reconnect signal before GCR 60-min timeout
    const reconnectTimer = setTimeout(() => {
      res.write(
        `data: ${JSON.stringify({ phase: "reconnect", message: "Reconnect to continue streaming" })}\n\n`
      );
    }, SSE_RECONNECT_MS);

    const listener = (event: ProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.phase === "done" || event.phase === "error") {
        if (keepAlive) clearInterval(keepAlive);
        clearTimeout(reconnectTimer);
      }
    };

    const unsubscribe = jobManager.subscribe(job.id, listener);

    req.on("close", () => {
      if (keepAlive) clearInterval(keepAlive);
      clearTimeout(reconnectTimer);
      if (unsubscribe) unsubscribe();
    });
  });

  app.get("/api/extract/:id/result", authMiddleware, async (req, res) => {
    const job = jobManager.get(req.params.id);
    if (job) {
      if (job.status !== "done") {
        res.status(202).json({ status: job.status, message: "Job still in progress" });
        return;
      }
      if (!job.result || !job.result.data) {
        res.status(500).json({ error: "Job completed but no result data" });
        return;
      }
      res.json(job.result.data);
      return;
    }

    // Disk / GCS fallback
    try {
      const outputDir = await resolveOutputDir(jobManager, req.params.id);
      if (!outputDir) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      // Extractor writes design-system.json; older versions wrote extraction.json
      const dsPath = path.join(outputDir, "design-system.json");
      const legacyPath = path.join(outputDir, "extraction.json");
      const localPath = fs.existsSync(dsPath) ? dsPath : fs.existsSync(legacyPath) ? legacyPath : null;
      if (!localPath) {
        // Try reading directly from GCS without full download
        const raw =
          (await readFileFromGCS(req.params.id, "design-system.json").catch(() => null)) ??
          (await readFileFromGCS(req.params.id, "extraction.json").catch(() => null));
        if (!raw) {
          res.status(404).json({ error: "Job result not found" });
          return;
        }
        res.json(JSON.parse(raw));
        return;
      }
      res.json(JSON.parse(fs.readFileSync(localPath, "utf-8")));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/extract/:id/download", authMiddleware, async (req, res) => {
    const job = jobManager.get(req.params.id);
    if (job && job.status !== "done") {
      res.status(202).json({ status: job.status, message: "Job still in progress" });
      return;
    }

    try {
      const outputDir = await resolveOutputDir(jobManager, req.params.id);
      if (!outputDir) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      const archiveName = `uiharvest-${req.params.id}`;
      await streamTarGz(outputDir, archiveName, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create archive" });
      }
    }
  });

  app.get("/api/extract/:id/memory", authMiddleware, async (req, res) => {
    try {
      const outputDir = await resolveOutputDir(jobManager, req.params.id);
      if (!outputDir) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      res.json(buildMemoryIndex(outputDir));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/extract/:id/memory/content", authMiddleware, async (req, res) => {
    const requestedPath = String(req.query.path ?? "");
    if (!requestedPath) {
      res.status(400).json({ message: "path query param required" });
      return;
    }

    try {
      const outputDir = await resolveOutputDir(jobManager, req.params.id);
      if (outputDir) {
        const filePath = resolveMemoryFile(outputDir, requestedPath);
        if (filePath) {
          res.json({ path: requestedPath, content: fs.readFileSync(filePath, "utf-8") });
          return;
        }
      }

      // Fallback: read directly from GCS
      const gcsRelPath = `design-memory/${requestedPath}`;
      const content = await readFileFromGCS(req.params.id, gcsRelPath).catch(() => null);
      if (!content) {
        res.status(404).json({ message: "Memory document not found" });
        return;
      }
      res.json({ path: requestedPath, content });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Serve job static output (screenshots, assets, fonts)
  app.use("/api/extract/:id/output", authMiddleware, async (req, res, next) => {
    const outputDir = getOutputDirForJob(jobManager, req.params.id);
    if (outputDir) {
      express.static(outputDir)(req, res, next);
      return;
    }

    // Fallback: stream from GCS
    // req.path starts with "/" — strip leading slash for GCS relPath
    const relPath = req.path.replace(/^\//, "");
    if (!relPath) {
      res.status(404).end();
      return;
    }

    try {
      const served = await streamFileToResponse(req.params.id, relPath, res);
      if (!served) res.status(404).end();
    } catch {
      res.status(500).end();
    }
  });

  // ── Delete job ────────────────────────────────────────────────────

  app.delete("/api/extract/:id", authMiddleware, async (req, res) => {
    const jobId = req.params.id;

    // Remove from in-memory store
    const job = jobManager.get(jobId);
    if (job) {
      try {
        if (fs.existsSync(job.outputDir)) {
          fs.rmSync(job.outputDir, { recursive: true, force: true });
        }
      } catch { }
    }

    // Remove from disk fallback
    const fallbackDir = path.join(os.tmpdir(), `uiharvest-job-${jobId}`);
    try {
      if (fs.existsSync(fallbackDir)) {
        fs.rmSync(fallbackDir, { recursive: true, force: true });
      }
    } catch { }

    // Remove from Firestore + GCS (parallel, best-effort)
    await Promise.allSettled([
      deleteJobRecord(jobId),
      deleteJobFromGCS(jobId),
    ]);

    res.json({ success: true });
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
    app.use((req, res, next) => {
      const isHtmlPath =
        req.path === "/" || req.path === "/index.html" || !req.path.includes(".");
      const isStaticAsset = /\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|ico|webp)$/i.test(
        req.path
      );

      if (isHtmlPath) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (isStaticAsset) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }

      next();
    });

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
