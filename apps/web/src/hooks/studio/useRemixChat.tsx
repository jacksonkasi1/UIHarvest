// ** import core packages
import { useState, useEffect, useRef, useCallback } from "react"
import type { Dispatch, SetStateAction } from "react"

// ** import lib
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from "@assistant-ui/react"

// ** import types
import type { GeneratedFile, ChatMessage, ImageAttachment, ChatEvent } from "@/types/studio"

// ** import utils
import { updateFiles, installPackages } from "@/lib/webcontainer"
import { apiRoutes } from "@/config/api"

const CHAT_DEBUG = import.meta.env.VITE_CHAT_DEBUG === "true"

function chatDebugLog(message: string, meta?: unknown): void {
  if (!CHAT_DEBUG) return
  if (meta !== undefined) {
    console.debug(`[useRemixChat] ${message}`, meta)
    return
  }
  console.debug(`[useRemixChat] ${message}`)
}

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface UseRemixChatReturn {
  messages: ChatMessage[]
  chatInput: string
  setChatInput: (val: string) => void
  isStreaming: boolean
  isThinking: boolean
  attachedImages: ImageAttachment[]
  setAttachedImages: Dispatch<SetStateAction<ImageAttachment[]>>
  refreshKey: number
  setRefreshKey: Dispatch<SetStateAction<number>>
  handleSendMessage: (overridePrompt?: string, mode?: string) => void
  handleStop: () => void
  chatInputRef: React.RefObject<HTMLInputElement | null>
  /** Wrap the studio tree with the assistant runtime provider */
  RuntimeProvider: React.ComponentType<{ children: React.ReactNode }>
}

// ────────────────────────────────────────────────────────────────────────────
// SSE streaming helper
// ────────────────────────────────────────────────────────────────────────────

async function streamChatEvents(
  jobId: string,
  prompt: string,
  mode: string,
  images: Array<{ data: string; mimeType: string }>,
  signal: AbortSignal,
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  const body: Record<string, unknown> = { prompt, mode }
  if (images.length > 0) body.images = images

  chatDebugLog("sending chat request", {
    jobId,
    mode,
    promptLength: prompt.length,
    images: images.length,
  })

  const res = await fetch(apiRoutes.chat(jobId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
    signal,
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }))
    chatDebugLog("chat request failed", { status: res.status, errData })
    throw new Error((errData as { error?: string }).error ?? "Chat request failed")
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal.aborted) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const jsonStr = line.slice(6).trim()
        if (!jsonStr) continue
        try {
          const event: ChatEvent = JSON.parse(jsonStr)
          chatDebugLog("received stream event", { type: event.type })
          onEvent(event)
        } catch {
          // ignore malformed frames / keep-alive
        }
      }
    }

    // flush remaining buffer
    if (buffer.startsWith("data: ")) {
      const jsonStr = buffer.slice(6).trim()
      if (jsonStr) {
        try {
          const event = JSON.parse(jsonStr) as ChatEvent
          chatDebugLog("received final stream event", { type: event.type })
          onEvent(event)
        } catch {
          // ignore
        }
      }
    }
  } finally {
    chatDebugLog("stream reader released")
    reader.releaseLock()
  }
}

// ────────────────────────────────────────────────────────────────────────────
// localStorage helpers
// ────────────────────────────────────────────────────────────────────────────

function saveMessages(jobId: string, messages: ChatMessage[]): void {
  try {
    const serializable = messages.map((m: ChatMessage) => ({
      ...m,
      images: m.images?.map((img: ImageAttachment) => ({
        ...img,
        preview: img.preview.slice(0, 200),
      })),
    }))
    localStorage.setItem(`remix-chat-${jobId}`, JSON.stringify(serializable))
  } catch {
    /* quota exceeded, no-op */
  }
}

function loadMessages(jobId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`remix-chat-${jobId}`)
    if (!raw) return []
    return JSON.parse(raw) as ChatMessage[]
  } catch {
    return []
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

/**
 * useRemixChat — AI Studio chat hook.
 *
 * Manages chat state and streams responses from apps/server via Server-Sent
 * Events. Integrates with @assistant-ui/react's ExternalStoreRuntime so the
 * studio view tree is wrapped in an AssistantRuntimeProvider, enabling future
 * use of assistant-ui primitives while keeping the existing custom UI intact.
 *
 * WebContainer file sync happens as a side-effect of tool_end events.
 */
export function useRemixChat(
  jobId: string,
  containerReady: boolean,
  setFiles: (files: GeneratedFile[]) => void,
  setContainerLogs: Dispatch<SetStateAction<string[]>>,
): UseRemixChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const abortControllerRef = useRef<AbortController | null>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const pendingFileBatchesRef = useRef<GeneratedFile[][]>([])

  // ── WebContainer file application ─────────────────────────────────────────

  const applyFileBatch = useCallback(
    async (batch: GeneratedFile[]) => {
      const results = await updateFiles(batch, (wEvent) => {
        setContainerLogs((prev) => [
          ...prev.slice(-200),
          `[${wEvent.type}] ${wEvent.message}`,
        ])
      })
      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        throw new Error(`Failed to write ${failed.length} files`)
      }
    },
    [setContainerLogs],
  )

  // Flush pending file batches when container becomes ready
  useEffect(() => {
    if (!containerReady || pendingFileBatchesRef.current.length === 0) return

    const flush = async () => {
      const pending = [...pendingFileBatchesRef.current]
      pendingFileBatchesRef.current = []
      for (const batch of pending) {
        try {
          await applyFileBatch(batch)
        } catch (err) {
          setContainerLogs((prev) => [
            ...prev.slice(-200),
            `[error] Deferred file update failed: ${(err as Error).message}`,
          ])
          pendingFileBatchesRef.current.push(batch)
        }
      }
    }

    void flush()
  }, [containerReady, applyFileBatch, setContainerLogs])

  // ── Message persistence ────────────────────────────────────────────────────

  useEffect(() => {
    const saved = loadMessages(jobId)
    if (saved.length > 0) {
      setMessages(saved)
    }
  }, [jobId])

  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(jobId, messages)
    }
  }, [messages, jobId])

  // ── Chat event handler ─────────────────────────────────────────────────────

  const handleChatEvent = useCallback(
    (event: ChatEvent, assistantMsgId: string) => {
      switch (event.type) {
        case "thinking":
          setIsThinking(true)
          break

        case "text":
          setIsThinking(false)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: event.content ?? "",
                    status: event.partial ? ("streaming" as const) : ("done" as const),
                  }
                : m,
            ),
          )
          break

        case "tool_start":
          setIsThinking(false)
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantMsgId) return m
              const statusLine = event.message ?? "Processing..."
              const toolExecs = [...(m.toolExecutions ?? [])]
              let lastRunning = -1
              for (let i = toolExecs.length - 1; i >= 0; i--) {
                if (toolExecs[i].status === "running") {
                  lastRunning = i
                  break
                }
              }
              if (lastRunning >= 0) {
                toolExecs[lastRunning] = {
                  ...toolExecs[lastRunning],
                  message: event.message ?? "Processing…",
                  summary: event.message ?? toolExecs[lastRunning].summary,
                }
              } else {
                toolExecs.push({
                  tool: event.tool ?? "unknown",
                  status: "running" as const,
                  message: statusLine,
                  summary: statusLine,
                })
              }
              const nextContent = m.content
                ? `${m.content}\n${statusLine}`
                : statusLine
              return { ...m, content: nextContent, toolExecutions: toolExecs }
            }),
          )
          break

        case "tool_end": {
          if (event.files) {
            const toolFiles = event.files
            setFiles(toolFiles)
            if (containerReady) {
              applyFileBatch(toolFiles).catch((err) => {
                setContainerLogs((prev) => [
                  ...prev.slice(-200),
                  `[error] File update failed, queued: ${(err as Error).message}`,
                ])
                pendingFileBatchesRef.current.push(toolFiles)
              })
            } else {
              pendingFileBatchesRef.current.push(toolFiles)
              setContainerLogs((prev) => [
                ...prev.slice(-200),
                `[mount] Container not ready, queued ${toolFiles.length} files`,
              ])
            }
          }
          if (event.packages && event.packages.length > 0 && containerReady) {
            const pkgs = event.packages
            setContainerLogs((prev) => [
              ...prev.slice(-200),
              `[install] Auto-installing: ${pkgs.join(", ")}`,
            ])
            installPackages(pkgs, (wEvent) => {
              setContainerLogs((prev) => [
                ...prev.slice(-200),
                `[${wEvent.type}] ${wEvent.message}`,
              ])
            })
              .then((ok) => {
                if (ok) setTimeout(() => setRefreshKey((prev) => prev + 1), 2000)
              })
              .catch(console.error)
          }
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantMsgId) return m
              const toolExecs = [...(m.toolExecutions ?? [])]
              let lastRunning = -1
              for (let i = toolExecs.length - 1; i >= 0; i--) {
                if (toolExecs[i].status === "running") {
                  lastRunning = i
                  break
                }
              }
              if (lastRunning >= 0) {
                toolExecs[lastRunning] = {
                  ...toolExecs[lastRunning],
                  status: "complete" as const,
                  summary: event.summary ?? toolExecs[lastRunning].summary,
                  filesChanged: event.files?.length,
                }
              }
              const completionLine = event.summary ?? event.message
              const nextContent = completionLine
                ? m.content
                  ? `${m.content}\n${completionLine}`
                  : completionLine
                : m.content
              return { ...m, content: nextContent, toolExecutions: toolExecs }
            }),
          )
          break
        }

        case "error":
          setIsThinking(false)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: m.content + `\n\n⚠️ ${event.error ?? "Unknown error"}`,
                    status: "done" as const,
                  }
                : m,
            ),
          )
          break

        case "done":
          setIsThinking(false)
          break
      }
    },
    [containerReady, applyFileBatch, setContainerLogs, setFiles],
  )

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    (overridePrompt?: string, mode?: string) => {
      const prompt = (overridePrompt ?? chatInput).trim()
      if (!prompt || isStreaming) return

      const currentImages = overridePrompt ? [] : [...attachedImages]

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: prompt,
        images: currentImages.length > 0 ? currentImages : undefined,
        timestamp: Date.now(),
        status: "done",
      }

      if (!overridePrompt) {
        setChatInput("")
        setAttachedImages([])
      }

      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      setIsThinking(true)

      const assistantMsgId = crypto.randomUUID()
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        status: "streaming",
        toolExecutions: [],
      }
      setMessages((prev) => [...prev, assistantMsg])

      const controller = new AbortController()
      abortControllerRef.current = controller

      const imagePayload = currentImages.map((img) => ({
        data: img.data,
        mimeType: img.mimeType,
      }))

      streamChatEvents(
        jobId,
        prompt,
        mode ?? "Chat",
        imagePayload,
        controller.signal,
        (event) => handleChatEvent(event, assistantMsgId),
      )
        .catch((err) => {
          chatDebugLog("streamChatEvents errored", { message: (err as Error).message })
          if ((err as Error).name === "AbortError") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: m.content || "_Stopped._",
                      status: "done" as const,
                    }
                  : m,
              ),
            )
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: `Error: ${(err as Error).message}`,
                      status: "done" as const,
                    }
                  : m,
              ),
            )
          }
        })
        .finally(() => {
          chatDebugLog("chat request lifecycle finished")
          setIsStreaming(false)
          setIsThinking(false)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId && m.status === "streaming"
                ? { ...m, status: "done" as const }
                : m,
            ),
          )
        })
    },
    [chatInput, isStreaming, attachedImages, jobId, handleChatEvent],
  )

  // ── Stop ───────────────────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsStreaming(false)
    setIsThinking(false)
  }, [])

  // ── assistant-ui ExternalStoreRuntime ──────────────────────────────────────
  // Bridges our custom state into an AssistantRuntimeProvider so the studio
  // view tree has access to the runtime context. UI components continue to use
  // our ChatMessage state directly; the runtime is available for future
  // assistant-ui component integration.

  const runtime = useExternalStoreRuntime({
    isRunning: isStreaming,
    messages,
    convertMessage: (msg: ChatMessage) => ({
      role: msg.role,
      content: [{ type: "text" as const, text: msg.content }],
      id: msg.id,
      createdAt: new Date(msg.timestamp),
    }),
    onNew: async (appendMsg) => {
      const textPart = appendMsg.content.find((p) => p.type === "text")
      const prompt = textPart && textPart.type === "text" ? textPart.text : ""
      if (prompt) handleSendMessage(prompt, "Chat")
    },
    onCancel: async () => {
      handleStop()
    },
  })

  const RuntimeProvider: React.ComponentType<{ children: React.ReactNode }> = useCallback(
    ({ children }: { children: React.ReactNode }) => (
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
    ),
    [runtime],
  )

  return {
    messages,
    chatInput,
    setChatInput,
    isStreaming,
    isThinking,
    attachedImages,
    setAttachedImages,
    refreshKey,
    setRefreshKey,
    handleSendMessage,
    handleStop,
    chatInputRef,
    RuntimeProvider,
  }
}
