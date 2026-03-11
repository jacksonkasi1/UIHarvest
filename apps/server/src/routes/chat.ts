// ** import core packages
import { Router } from "express"

// ** import lib
import { auth } from "./auth.js"
import { handleChat } from "../chat/chat-handler.js"

export const chatRouter = Router()

/**
 * POST /api/chat/:jobId
 *
 * Streaming chat endpoint for the AI Studio.
 * Streams Server-Sent Events (SSE) back to the client.
 *
 * Body:
 *   - prompt: string
 *   - images?: Array<{ data: string; mimeType: string }>
 *   - mode?: "Chat" | "Smart" | "Yolo"
 */
chatRouter.post(
  "/chat/:jobId",
  auth.authMiddleware,
  async (req, res) => {
    const { jobId } = req.params
    const { prompt, images, mode } = req.body as {
      prompt: string
      images?: Array<{ data: string; mimeType: string }>
      mode?: string
    }

    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "prompt is required" })
      return
    }

    // ── SSE headers ────────────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")
    res.flushHeaders()

    // ── Abort controller (client disconnect) ───────────────────────────────────
    const controller = new AbortController()
    let streamStarted = false

    const keepAliveInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": keep-alive\n\n")
        if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
          ;(res as unknown as { flush: () => void }).flush()
        }
      }
    }, 15_000)

    req.on("close", () => {
      clearInterval(keepAliveInterval)
      // Only abort if the stream has genuinely started — Cloud Run may fire
      // 'close' prematurely on the POST body read. We abort to free AI SDK
      // resources, but the generation saves to Firestore regardless.
      if (streamStarted) {
        controller.abort()
      }
    })

    try {
      streamStarted = true
      await handleChat({
        jobId,
        prompt,
        images,
        mode,
        res,
        signal: controller.signal,
      })
    } finally {
      clearInterval(keepAliveInterval)
      if (!res.writableEnded) {
        res.end()
      }
    }
  }
)
