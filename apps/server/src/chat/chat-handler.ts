// ** import core packages
import type { Response } from "express"

// ** import types
import type { ChatEvent } from "@uiharvest/types"

// ** import apis
import { streamText, tool, stepCountIs } from "ai"
import { zodSchema } from "@ai-sdk/provider-utils"
import { getChatModel } from "../ai/provider.js"
import { codeEditSchema } from "../ai/tools/code-edit.js"
import { buildStudioSystemPrompt } from "../ai/prompts/system.js"
import { jobStore } from "@uiharvest/db"
import type { StoredFile, PersistedJob } from "@uiharvest/db"
import { morphConfig } from "../config.js"

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
    console.error("[chat-handler] SSE write error:", (err as Error).message)
  }
}

// ════════════════════════════════════════════════════
// MORPH FAST APPLY
// ════════════════════════════════════════════════════

/**
 * Calls the Morph Fast Apply API to merge an edit snippet into the original file.
 *
 * Returns the merged full file content on success, or null on failure
 * (the caller should fall back to using the snippet as-is).
 */
async function applyMorphEdit(
  originalContent: string,
  instructions: string,
  editSnippet: string
): Promise<string | null> {
  if (!morphConfig.enabled || !morphConfig.apiKey) {
    return null
  }

  try {
    const res = await fetch(`${morphConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${morphConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: morphConfig.model,
        messages: [
          {
            role: "user",
            content: `<instruction>${instructions}</instruction>\n<code>${originalContent}</code>\n<update>${editSnippet}</update>`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      console.warn(`[morph] API returned ${res.status}`)
      return null
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const merged = data.choices?.[0]?.message?.content?.trim()
    return merged || null
  } catch (err) {
    console.warn("[morph] Apply failed:", (err as Error).message)
    return null
  }
}

// ════════════════════════════════════════════════════
// MAIN CHAT HANDLER
// ════════════════════════════════════════════════════

export interface ChatHandlerOptions {
  jobId: string
  prompt: string
  images?: Array<{ data: string; mimeType: string }>
  mode?: string
  res: Response
  signal: AbortSignal
}

/**
 * Handles a streaming chat request for the AI Studio.
 *
 * Uses Vercel AI SDK v6 streamText with the codeEdit tool.
 * When codeEdit is called, Morph Fast Apply is used to merge
 * snippet edits into the original files (with full-file fallback).
 *
 * Writes SSE events to the Express response throughout.
 */
export async function handleChat(options: ChatHandlerOptions): Promise<void> {
  const { jobId, prompt, images, mode, res, signal } = options

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
    console.warn("[chat-handler] Failed to load files from Firestore:", (err as Error).message)
  }

  const fileMap = new Map<string, string>(currentFiles.map((f) => [f.path, f.content]))
  const systemPrompt = buildStudioSystemPrompt(currentFiles)

  // Step limits based on mode (AI SDK v6 uses stopWhen: stepCountIs(n))
  const maxStepCount = mode === "Yolo" ? 20 : mode === "Smart" ? 5 : 2

  sendSSE(res, { type: "thinking", message: "Understanding your request…" })

  try {
    // Build user message content (text + optional images)
    type UserContent =
      | string
      | Array<
          | { type: "text"; text: string }
          | { type: "image"; image: string; mimeType: string }
        >

    let userContent: UserContent = prompt

    if (images && images.length > 0) {
      userContent = [
        { type: "text", text: prompt },
        ...images.map((img) => ({
          type: "image" as const,
          image: img.data,
          mimeType: img.mimeType,
        })),
      ]
    }

    const result = streamText({
      model: getChatModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      stopWhen: stepCountIs(maxStepCount),
      abortSignal: signal,
      tools: {
        codeEdit: tool({
          description:
            "Edit a file in the project. Use a snippet with context markers for targeted edits, or provide full file content for rewrites.",
          inputSchema: zodSchema(codeEditSchema),
          execute: async ({ path, instructions, editSnippet }) => {
            sendSSE(res, {
              type: "tool_start",
              tool: "code_edit",
              message: `Editing ${path}…`,
            })

            const originalContent = fileMap.get(path) ?? ""
            let finalContent: string

            if (originalContent) {
              // Try Morph Fast Apply first
              const morphResult = await applyMorphEdit(
                originalContent,
                instructions,
                editSnippet
              )

              if (morphResult) {
                console.log(`[chat-handler] Morph applied ${path}`)
                finalContent = morphResult
              } else {
                // Fallback: snippet as-is (model was instructed to write full file when needed)
                finalContent = editSnippet
                console.log(`[chat-handler] Morph fallback (using snippet) for ${path}`)
              }
            } else {
              // New file — snippet IS the full content
              finalContent = editSnippet
            }

            // Update in-memory map
            fileMap.set(path, finalContent)
            const updatedFile: StoredFile = { path, content: finalContent }

            // Persist to Firestore — rebuild full files array and save
            try {
              if (jobStore.isEnabled && persistedJob) {
                const updatedFiles: StoredFile[] = [
                  ...Array.from(fileMap.entries())
                    .filter(([p]) => p !== path)
                    .map(([p, c]) => ({ path: p, content: c })),
                  updatedFile,
                ]
                await jobStore.save(persistedJob, updatedFiles)
              }
            } catch (err) {
              console.warn("[chat-handler] Firestore persist failed:", (err as Error).message)
            }

            sendSSE(res, {
              type: "tool_end",
              tool: "code_edit",
              files: [updatedFile],
              summary: instructions,
              message: `Updated ${path}`,
            })

            return { success: true, path, linesChanged: finalContent.split("\n").length }
          },
        }),
      },
    })

    // Stream text deltas
    let fullText = ""
    for await (const delta of result.textStream) {
      if (signal.aborted) break
      fullText += delta
      sendSSE(res, { type: "text", content: fullText, partial: true })
    }

    if (!signal.aborted && fullText) {
      sendSSE(res, { type: "text", content: fullText, partial: false })
    }

    sendSSE(res, { type: "done" })
  } catch (err) {
    if ((err as Error).name === "AbortError") return
    console.error("[chat-handler] streamText error:", (err as Error).message)
    sendSSE(res, {
      type: "error",
      error: `Something went wrong: ${(err as Error).message}`,
    })
    // Send done after error so frontend knows the stream is finished
    sendSSE(res, { type: "done" })
  }
}
