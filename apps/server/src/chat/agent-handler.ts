// ** import core packages
import type { Response } from "express"

// ** import types
import type { ChatEvent } from "@uiharvest/types"
import type { StoredFile, PersistedJob } from "@uiharvest/db"

// ** import lib
import { AIMessageChunk, ToolMessage } from "langchain"
import { jobStore } from "@uiharvest/db"
import { buildOrchestrator } from "../ai/agents/orchestrator.js"
import { getMCPTools, getDefaultMCPConfig } from "../ai/mcp/mcp-client.js"

// ════════════════════════════════════════════════════
// SSE HELPERS
// ════════════════════════════════════════════════════

function sendSSE(res: Response, event: ChatEvent): void {
  try {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
      if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
        ;(res as unknown as { flush: () => void }).flush()
      }
    }
  } catch (err) {
    console.error("[agent-handler] SSE write error:", (err as Error).message)
  }
}

// ════════════════════════════════════════════════════
// MAIN AGENT HANDLER
// ════════════════════════════════════════════════════

export interface AgentHandlerOptions {
  jobId: string
  prompt: string
  images?: Array<{ data: string; mimeType: string }>
  mode?: string
  res: Response
  signal: AbortSignal
}

/**
 * Handles a streaming chat request using the LangChain multi-agent orchestrator.
 *
 * Replaces the previous Vercel AI SDK streamText handler.
 * Uses LangChain's createAgent with sub-agents (code_editor, scaffolder,
 * debugger, planner) wired as tools.
 *
 * Streams SSE events to the Express response throughout execution.
 */
export async function handleAgentChat(options: AgentHandlerOptions): Promise<void> {
  const { jobId, prompt, res, signal } = options
  const subagentToolCalls = new Set<string>()

  console.log(`[agent-handler] start jobId=${jobId} promptLen=${prompt.length}`)

  // ── Load current files from Firestore ──────────────────────────────────────
  let currentFiles: StoredFile[] = []
  let persistedJob: PersistedJob | null = null
  try {
    if (jobStore.isEnabled) {
      const loaded = await jobStore.load(jobId)
      currentFiles = loaded?.files ?? []
      persistedJob = loaded?.job ?? null
    }
  } catch (err) {
    console.warn("[agent-handler] Failed to load files from Firestore:", (err as Error).message)
  }

  console.log(
    `[agent-handler] loaded files=${currentFiles.length} firestoreEnabled=${jobStore.isEnabled}`,
  )

  const fileMap = new Map<string, string>(currentFiles.map((f) => [f.path, f.content]))

  // ── Load MCP tools (if configured) ─────────────────────────────────────────
  let mcpTools: Awaited<ReturnType<typeof getMCPTools>> = []
  try {
    // TODO: Load MCP config from project settings (Firestore or .uiharvest/mcp.json)
    const mcpConfig = getDefaultMCPConfig()
    mcpTools = await getMCPTools(mcpConfig)
  } catch (err) {
    console.warn("[agent-handler] MCP tools load failed:", (err as Error).message)
  }

  sendSSE(res, { type: "thinking", message: "Understanding your request…" })

  // ── Build orchestrator with code-edit callbacks ────────────────────────────
  const orchestrator = buildOrchestrator({
    fileMap,
    currentFiles,
    mcpTools,
    codeEditCallbacks: {
      onEditStart: (path) => {
        subagentToolCalls.add("code_editor")
        subagentToolCalls.add("code_edit")
        sendSSE(res, {
          type: "tool_start",
          tool: "code_edit",
          message: `Editing ${path}…`,
        })
      },
      onEditComplete: (updatedFile, instructions) => {
        // Persist to Firestore
        persistFileToFirestore(fileMap, persistedJob, updatedFile).catch((err) => {
          console.warn("[agent-handler] Firestore persist failed:", err.message)
        })

        sendSSE(res, {
          type: "tool_end",
          tool: "code_edit",
          files: [updatedFile],
          summary: instructions,
          message: `Updated ${updatedFile.path}`,
        })
      },
    },
  })

  try {
    // ── Stream agent execution ─────────────────────────────────────────────
    const stream = await orchestrator.stream(
      {
        messages: [{ role: "user", content: prompt }],
      },
      { streamMode: "messages", subgraphs: true }
    )

    console.log("[agent-handler] orchestrator stream connected")

    let fullText = ""
    let eventCount = 0

    for await (const [namespace, chunk] of stream) {
      if (signal.aborted) break

      eventCount += 1

      const [message] = chunk

      // Identify if this is from a sub-agent
      const isSubagent = namespace.some((s: string) => s.startsWith("tools:"))
      const source = isSubagent
        ? namespace.find((s: string) => s.startsWith("tools:"))!
        : "main"

      // Tool call events from sub-agents
      if (AIMessageChunk.isInstance(message) && message.tool_call_chunks?.length) {
        for (const tc of message.tool_call_chunks) {
          if (tc.name && source !== "main") {
            subagentToolCalls.add(tc.name)
            sendSSE(res, {
              type: "tool_start",
              tool: tc.name,
              message: `Running ${tc.name}…`,
            })
          }
        }
      }

      // Tool results
      if (ToolMessage.isInstance(message) && source !== "main") {
        sendSSE(res, {
          type: "tool_end",
          tool: message.name ?? "unknown",
          message: `Completed ${message.name ?? "operation"}`,
        })
      }

      // Main agent text output (skip sub-agent text and tool calls)
      if (
        AIMessageChunk.isInstance(message) &&
        message.text &&
        !message.tool_call_chunks?.length &&
        source === "main"
      ) {
        fullText += message.text
        sendSSE(res, { type: "text", content: fullText, partial: true })
      }
    }

    console.log(
      `[agent-handler] stream finished events=${eventCount} textLen=${fullText.length} aborted=${signal.aborted}`,
    )
    console.log(
      `[agent-handler] subagent tool calls: ${
        subagentToolCalls.size > 0
          ? Array.from(subagentToolCalls).join(", ")
          : "none"
      }`,
    )

    // Final text event
    if (!signal.aborted && fullText) {
      sendSSE(res, { type: "text", content: fullText, partial: false })
    }

    sendSSE(res, { type: "done" })
  } catch (err) {
    if ((err as Error).name === "AbortError") return
    console.error("[agent-handler] Agent error:", (err as Error).message)
    console.error("[agent-handler] Agent error stack:", (err as Error).stack)
    sendSSE(res, {
      type: "error",
      error: `Something went wrong: ${(err as Error).message}`,
    })
    sendSSE(res, { type: "done" })
  }
}

// ════════════════════════════════════════════════════
// FIRESTORE PERSISTENCE
// ════════════════════════════════════════════════════

async function persistFileToFirestore(
  fileMap: Map<string, string>,
  persistedJob: PersistedJob | null,
  updatedFile: StoredFile
): Promise<void> {
  if (!jobStore.isEnabled || !persistedJob) return

  const updatedFiles: StoredFile[] = [
    ...Array.from(fileMap.entries())
      .filter(([p]) => p !== updatedFile.path)
      .map(([p, c]) => ({ path: p, content: c })),
    updatedFile,
  ]
  await jobStore.save(persistedJob, updatedFiles)
}
