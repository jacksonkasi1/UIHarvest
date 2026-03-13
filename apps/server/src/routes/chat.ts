// ** import core packages
import { Router } from "express"
import { randomUUID } from "node:crypto"

// ** import lib
import { auth } from "./auth.js"
import { handleAgentChat } from "../chat/agent-handler.js"

export const chatRouter = Router()

/**
 * POST /api/chat/:jobId
 *
 * Streaming chat endpoint for the AI Studio.
 * Uses LangChain multi-agent orchestrator.
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

    const requestId = randomUUID().slice(0, 8)
    const promptLength = typeof prompt === "string" ? prompt.length : 0
    const imagesCount = Array.isArray(images) ? images.length : 0

    console.log(
      `[chat:${requestId}] request received jobId=${jobId} mode=${mode ?? "Chat"} promptLen=${promptLength} images=${imagesCount}`,
    )

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

    req.on("aborted", () => {
      clearInterval(keepAliveInterval)
      if (streamStarted) {
        controller.abort()
      }
      console.log(`[chat:${requestId}] request aborted by client`)
    })

    res.on("close", () => {
      clearInterval(keepAliveInterval)
      if (!res.writableEnded && streamStarted) {
        controller.abort()
        console.log(`[chat:${requestId}] response closed before completion`)
      }
    })

    try {
      streamStarted = true
      console.log(`[chat:${requestId}] stream started`)
      await handleAgentChat({
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
      console.log(`[chat:${requestId}] stream closed`)
    }
  }
)
