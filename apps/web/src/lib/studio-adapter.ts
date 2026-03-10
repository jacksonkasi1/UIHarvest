// ** import types
import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from "@assistant-ui/react"
import type { ChatEvent, GeneratedFile } from "@/types/studio"

// ** import config
import { apiRoutes } from "@/config/api"

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type ToolEndCallback = (files: GeneratedFile[], packages: string[]) => void

export interface StudioAdapterOptions {
  /** Job ID to pass to the chat endpoint */
  getJobId: () => string
  /** Current mode: "Chat" | "Smart" | "Yolo" */
  getMode: () => string
  /** Called when a tool_end event carries files/packages for WebContainer sync */
  onToolEnd?: ToolEndCallback
}

// ────────────────────────────────────────────────────────────────────────────
// Internal tool-call state
// ────────────────────────────────────────────────────────────────────────────

interface InternalToolCall {
  toolCallId: string
  toolName: string
  /** Serialised args JSON string (we store instruction message here) */
  args: Record<string, unknown>
  result?: {
    summary?: string
    filesChanged: number
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Adapter
// ────────────────────────────────────────────────────────────────────────────

/**
 * ChatModelAdapter for the UIHarvest AI Studio.
 *
 * Connects to `apps/server` POST /api/chat/:jobId which streams custom
 * Server-Sent Events (ChatEvent JSON) over newline-delimited "data:" frames.
 *
 * Translates the server's ChatEvent protocol into assistant-ui's
 * ChatModelRunResult format while side-effecting WebContainer file sync via
 * the onToolEnd callback.
 */
export function createStudioAdapter(options: StudioAdapterOptions): ChatModelAdapter {
  return {
    async *run(runOptions: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
      const { messages, abortSignal } = runOptions

      // ── Extract the latest user message ─────────────────────────────────
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
      if (!lastUserMsg) return

      // Build prompt text + images from the last user message parts
      let prompt = ""
      const images: Array<{ data: string; mimeType: string }> = []

      for (const part of lastUserMsg.content) {
        if (part.type === "text") {
          prompt = part.text
        } else if (part.type === "image") {
          // assistant-ui image parts: image field holds URL or base64 data URL
          const rawImage = (part as { type: "image"; image: string | Uint8Array; mimeType?: string }).image
          const imageStr = typeof rawImage === "string" ? rawImage : ""
          if (imageStr) {
            images.push({
              data: imageStr,
              mimeType: (part as { type: "image"; mimeType?: string }).mimeType ?? "image/png",
            })
          }
        }
      }

      const jobId = options.getJobId()
      const mode = options.getMode()

      // ── POST to studio server ────────────────────────────────────────────
      const body: Record<string, unknown> = { prompt, mode }
      if (images.length > 0) body.images = images

      const res = await fetch(apiRoutes.chat(jobId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortSignal,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error((errData as { error?: string }).error ?? "Chat request failed")
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""

      // ── Running state ────────────────────────────────────────────────────
      let accumulatedText = ""
      let toolCallCounter = 0
      // Ordered list of tool call IDs (preserves insertion order)
      const toolCallOrder: string[] = []
      // Map from callId → tool call state
      const toolCalls = new Map<string, InternalToolCall>()

      const buildContent = (): ChatModelRunResult["content"] => {
        const parts: Array<
          | { type: "text"; text: string }
          | { type: "tool-call"; toolCallId: string; toolName: string; argsText: string; args: Record<string, unknown>; result?: unknown }
        > = []

        if (accumulatedText) {
          parts.push({ type: "text", text: accumulatedText })
        }

        for (const id of toolCallOrder) {
          const tc = toolCalls.get(id)
          if (!tc) continue
          const part: {
            type: "tool-call"
            toolCallId: string
            toolName: string
            argsText: string
            args: Record<string, unknown>
            result?: unknown
          } = {
            type: "tool-call",
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            argsText: JSON.stringify(tc.args),
            args: tc.args,
          }
          if (tc.result !== undefined) {
            part.result = tc.result
          }
          parts.push(part)
        }

        return parts as ChatModelRunResult["content"]
      }

      const processEvent = (event: ChatEvent): void => {
        switch (event.type) {
          case "thinking":
            // No content change — just a heartbeat signal
            break

          case "text":
            // Server sends cumulative full text content (not deltas)
            if (event.content !== undefined) {
              accumulatedText = event.content
            }
            break

          case "tool_start": {
            const callId = `tool_${++toolCallCounter}`
            const toolName = event.tool ?? "code_edit"
            toolCallOrder.push(callId)
            toolCalls.set(callId, {
              toolCallId: callId,
              toolName,
              args: { message: event.message ?? "" },
            })
            break
          }

          case "tool_end": {
            // Mark the most-recent running tool call as complete
            const lastId = toolCallOrder[toolCallOrder.length - 1]
            if (lastId) {
              const tc = toolCalls.get(lastId)
              if (tc) {
                toolCalls.set(lastId, {
                  ...tc,
                  result: {
                    summary: event.summary,
                    filesChanged: event.files?.length ?? 0,
                  },
                })
              }
            }
            // Side-effect: notify WebContainer with changed files
            if (options.onToolEnd) {
              options.onToolEnd(event.files ?? [], event.packages ?? [])
            }
            break
          }

          case "error":
            throw new Error(event.error ?? "Unknown server error")

          case "done":
            break
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (abortSignal?.aborted) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue
            try {
              const event: ChatEvent = JSON.parse(jsonStr)
              processEvent(event)
              yield { content: buildContent() }
            } catch {
              // Ignore parse errors on keep-alive / malformed frames
            }
          }
        }

        // Flush remaining buffer
        if (buffer.startsWith("data: ")) {
          const jsonStr = buffer.slice(6).trim()
          if (jsonStr) {
            try {
              const event: ChatEvent = JSON.parse(jsonStr)
              processEvent(event)
            } catch {
              // ignore
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // Final yield with complete content
      yield { content: buildContent() }
    },
  }
}
