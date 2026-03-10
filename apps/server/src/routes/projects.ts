// ** import core packages
import { Router } from "express"
import type { Request, Response } from "express"
import { randomUUID } from "crypto"

// ** import database
import { jobStore } from "@uiharvest/db"

// ** import middleware
import { auth } from "./auth.js"

// ** import scaffold
import { generateProjectScaffold, normalizeScaffoldFiles } from "../scaffold/scaffold-generator.js"

export const projectsRouter = Router()

projectsRouter.use(auth.authMiddleware)

// ── SSE helper ───────────────────────────────────────────────────────────────

function sendSSE(res: Response, data: object): void {
  try {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
      if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
        ;(res as unknown as { flush: () => void }).flush()
      }
    }
  } catch {
    // ignore
  }
}

// ── POST /api/projects — create a new project ────────────────────────────────
//
// Body: { name?: string, initialPrompt?: string }
// Returns: { projectId: string }
//
// The actual file generation is driven via SSE on GET /api/projects/:id/progress.
// This endpoint only creates the job record and returns the id immediately.

projectsRouter.post("/projects", async (req: Request, res: Response) => {
  const { name, initialPrompt } = req.body ?? {}

  const projectId = randomUUID()
  const projectName: string = (typeof name === "string" && name.trim()) ? name.trim() : "My Project"
  const prompt: string = (typeof initialPrompt === "string") ? initialPrompt.trim() : ""

  // Persist the job with status "generating" right away so the progress SSE
  // can be opened even before files are ready.
  await jobStore.save(
    {
      id: projectId,
      status: "generating",
      phase: "generating",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      initialPrompt: prompt || undefined,
      projectName: projectName,
      result: null,
    },
    [],
  )

  res.json({ projectId, name: projectName })
})

// ── GET /api/projects — list all projects ────────────────────────────────────

projectsRouter.get("/projects", async (_req: Request, res: Response) => {
  const jobs = await jobStore.listJobs(50)
  // Return only standalone projects (those without a targetUrl / referenceUrl
  // which are scraper-originated jobs) — OR return all and let the frontend
  // filter. For simplicity return everything; the frontend can distinguish.
  res.json({ projects: jobs })
})

// ── GET /api/projects/:id/files — return stored files ────────────────────────

projectsRouter.get("/projects/:id/files", async (req: Request, res: Response) => {
  const { id } = req.params
  const data = await jobStore.load(id)
  if (!data) {
    res.status(404).json({ error: "Project not found" })
    return
  }

  const projectName = data.job.projectName?.trim() || "My Project"
  const normalizedFiles = normalizeScaffoldFiles(projectName, data.files)

  res.json({ files: normalizedFiles, job: data.job })
})

// ── POST /api/projects/:id/files — persist a single file edit ────────────────

projectsRouter.post("/projects/:id/files", async (req: Request, res: Response) => {
  const { id } = req.params
  const { path, content } = req.body ?? {}

  if (!path || typeof content !== "string") {
    res.status(400).json({ error: "path and content are required" })
    return
  }

  const data = await jobStore.load(id)
  if (!data) {
    res.status(404).json({ error: "Project not found" })
    return
  }

  const updatedFiles = data.files.map((f) => (f.path === path ? { ...f, content } : f))
  if (!updatedFiles.find((f) => f.path === path)) {
    updatedFiles.push({ path, content })
  }

  const projectName = data.job.projectName?.trim() || "My Project"
  const normalizedFiles = normalizeScaffoldFiles(projectName, updatedFiles)

  await jobStore.save({ ...data.job, updatedAt: Date.now() }, normalizedFiles)
  res.json({ ok: true })
})

// ── PUT /api/projects/:id — update a project ─────────────────────────────────

projectsRouter.put("/projects/:id", async (req: Request, res: Response) => {
  const { id } = req.params
  const { name } = req.body ?? {}

  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" })
    return
  }

  const data = await jobStore.load(id)
  if (!data) {
    res.status(404).json({ error: "Project not found" })
    return
  }

  await jobStore.save({ ...data.job, projectName: name.trim(), updatedAt: Date.now() }, data.files)
  res.json({ ok: true })
})

// ── GET /api/projects/:id/progress — SSE stream for project creation ─────────
//
// Behaviour:
//   • If the project files already exist and status === "ready" → emit "ready"
//     immediately and close.
//   • Otherwise → generate scaffold, stream progress events, save to Firestore,
//     then emit "ready".

projectsRouter.get("/projects/:id/progress", async (req: Request, res: Response) => {
  const { id } = req.params

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()

  const data = await jobStore.load(id)

  if (!data) {
    sendSSE(res, { phase: "error", message: "Project not found", progress: 0 })
    res.end()
    return
  }

  // If already ready (existing project reopened) → just emit ready immediately
  if (data.job.status === "ready" && data.files.length > 0) {
    sendSSE(res, { phase: "ready", message: "Project ready", progress: 100 })
    res.end()
    return
  }

  // Otherwise generate files now
  const projectName = data.job.projectName?.trim() || "My Project"

  try {
    const files = await generateProjectScaffold(
      projectName,
      data.job.initialPrompt ?? "",
      res,
    )

    // Persist generated files
    await jobStore.save(
      {
        ...data.job,
        status: "ready",
        phase: "ready",
        updatedAt: Date.now(),
      },
      files,
    )
  } catch (err) {
    console.error("[projects] scaffold generation failed:", err)
    sendSSE(res, { phase: "error", message: "Failed to generate project", progress: 0 })
  }

  res.end()
})
