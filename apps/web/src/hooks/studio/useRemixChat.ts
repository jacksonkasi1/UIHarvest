import { useState, useEffect, useRef } from "react"
import type { Dispatch, SetStateAction } from "react"
import type { GeneratedFile, ChatMessage, ImageAttachment, ChatEvent } from "@/types/studio"
import { updateFiles, installPackages } from "@/lib/webcontainer"
import { apiRoutes } from "@/config/api"

export function useRemixChat(
    jobId: string,
    containerReady: boolean,
    setFiles: (files: GeneratedFile[]) => void,
    setContainerLogs: Dispatch<SetStateAction<string[]>>,
) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [chatInput, setChatInput] = useState("")
    const [isStreaming, setIsStreaming] = useState(false)
    const [isThinking, setIsThinking] = useState(false)
    const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
    const [refreshKey, setRefreshKey] = useState(0)

    const abortControllerRef = useRef<AbortController | null>(null)
    const chatInputRef = useRef<HTMLInputElement>(null)
    const pendingFileBatchesRef = useRef<GeneratedFile[][]>([])

    const applyFileBatch = async (batch: GeneratedFile[]) => {
        const results = await updateFiles(batch, (wEvent) => {
            setContainerLogs((prev: string[]) => [...prev.slice(-200), `[${wEvent.type}] ${wEvent.message}`])
        })

        const failed = results.filter((result) => !result.success)
        if (failed.length > 0) {
            throw new Error(`Failed to write ${failed.length} files`)
        }
    }

    useEffect(() => {
        if (!containerReady || pendingFileBatchesRef.current.length === 0) return

        const flush = async () => {
            const pending = [...pendingFileBatchesRef.current]
            pendingFileBatchesRef.current = []
            for (const batch of pending) {
                try {
                    await applyFileBatch(batch)
                } catch (err) {
                    setContainerLogs((prev: string[]) => [
                        ...prev.slice(-200),
                        `[error] Deferred file update failed: ${(err as Error).message}`,
                    ])
                    pendingFileBatchesRef.current.push(batch)
                }
            }
        }

        void flush()
    }, [containerReady])

    // Persist messages
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

    const handleSendMessage = async (overridePrompt?: string, mode?: string) => {
        const prompt = (overridePrompt ?? chatInput).trim()
        if (!prompt || isStreaming) return

        const currentImages = overridePrompt ? [] : [...attachedImages]
        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: prompt,
            images: currentImages.length > 0 ? currentImages : undefined,
            timestamp: Date.now(),
            status: "done"
        }

        if (!overridePrompt) {
            setChatInput("")
            setAttachedImages([])
        }
        setMessages((prev: ChatMessage[]) => [...prev, userMsg])
        setIsStreaming(true)
        setIsThinking(true)

        const assistantMsgId = crypto.randomUUID()
        const assistantMsg: ChatMessage = {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            status: "streaming",
            toolExecutions: []
        }
        setMessages((prev: ChatMessage[]) => [...prev, assistantMsg])

        const controller = new AbortController()
        abortControllerRef.current = controller

        try {
            const body: Record<string, unknown> = { prompt, mode }
            if (currentImages.length > 0) {
                body.images = currentImages.map((img) => ({
                    data: img.data,
                    mimeType: img.mimeType,
                }))
            }

            const res = await fetch(apiRoutes.remixChat(jobId), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Unknown error" }))
                setMessages((prev: ChatMessage[]) =>
                    prev.map((m: ChatMessage) =>
                        m.id === assistantMsgId
                            ? { ...m, content: `Error: ${errData.error}`, status: "done" as const }
                            : m
                    )
                )
                setIsStreaming(false)
                setIsThinking(false)
                return
            }

            const reader = res.body?.getReader()
            if (!reader) throw new Error("No response body")

            const decoder = new TextDecoder()
            let buffer = ""

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() || ""

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue
                    const jsonStr = line.slice(6)
                    if (!jsonStr.trim()) continue
                    try {
                        const event: ChatEvent = JSON.parse(jsonStr)
                        handleChatEvent(event, assistantMsgId)
                    } catch { }
                }
            }

            if (buffer.startsWith("data: ")) {
                const jsonStr = buffer.slice(6)
                if (jsonStr.trim()) {
                    try {
                        const event: ChatEvent = JSON.parse(jsonStr)
                        handleChatEvent(event, assistantMsgId)
                    } catch { }
                }
            }
        } catch (err) {
            if ((err as Error).name === "AbortError") {
                setMessages((prev: ChatMessage[]) =>
                    prev.map((m: ChatMessage) =>
                        m.id === assistantMsgId
                            ? { ...m, content: m.content || "_Stopped._", status: "done" as const }
                            : m
                    )
                )
            } else {
                setMessages((prev: ChatMessage[]) =>
                    prev.map((m: ChatMessage) =>
                        m.id === assistantMsgId
                            ? { ...m, content: `Error: ${(err as Error).message}`, status: "done" as const }
                            : m
                    )
                )
            }
        } finally {
            setIsStreaming(false)
            setIsThinking(false)
            setMessages((prev: ChatMessage[]) =>
                prev.map((m: ChatMessage) =>
                    m.id === assistantMsgId && m.status === "streaming"
                        ? { ...m, status: "done" as const }
                        : m
                )
            )
        }
    }

    const handleChatEvent = (event: ChatEvent, assistantMsgId: string) => {
        switch (event.type) {
            case "thinking":
                setIsThinking(true)
                break

            case "text":
                setIsThinking(false)
                setMessages((prev: ChatMessage[]) =>
                    prev.map((m: ChatMessage) =>
                        m.id === assistantMsgId
                            ? { ...m, content: event.content || "", status: event.partial ? "streaming" as const : "done" as const }
                            : m
                    )
                )
                break

            case "tool_start":
                setIsThinking(false)
                setMessages((prev: ChatMessage[]) =>
                    prev.map((m: ChatMessage) => {
                        if (m.id !== assistantMsgId) return m

                        const toolExecs = [...(m.toolExecutions || [])]
                        let lastRunning = -1
                        for (let idx = toolExecs.length - 1; idx >= 0; idx--) {
                            if (toolExecs[idx].status === "running") { lastRunning = idx; break }
                        }

                        if (lastRunning >= 0) {
                            toolExecs[lastRunning] = {
                                ...toolExecs[lastRunning],
                                message: event.message || "Processing..."
                            }
                        } else {
                            toolExecs.push({
                                tool: event.tool || "unknown",
                                status: "running" as const,
                                message: event.message || "Processing..."
                            })
                        }

                        return { ...m, toolExecutions: toolExecs }
                    })
                )
                break

            case "tool_end":
                if (event.files) {
                    const toolFiles = event.files
                    setFiles(toolFiles)
                    if (containerReady) {
                        applyFileBatch(toolFiles).catch((err) => {
                            setContainerLogs((prev: string[]) => [
                                ...prev.slice(-200),
                                `[error] File update failed, queued for retry: ${(err as Error).message}`,
                            ])
                            pendingFileBatchesRef.current.push(toolFiles)
                        })
                    } else {
                        pendingFileBatchesRef.current.push(toolFiles)
                        setContainerLogs((prev: string[]) => [
                            ...prev.slice(-200),
                            `[mount] Container not ready, queued ${toolFiles.length} files for retry`,
                        ])
                    }
                }
                if (event.packages && event.packages.length > 0 && containerReady) {
                    const pkgs = event.packages
                    setContainerLogs((prev: string[]) => [...prev.slice(-200), `[install] Auto-installing: ${pkgs.join(", ")}`])
                    installPackages(pkgs, (wEvent) => {
                        setContainerLogs((prev: string[]) => [...prev.slice(-200), `[${wEvent.type}] ${wEvent.message}`])
                    }).then((ok) => {
                        if (ok) {
                            setTimeout(() => setRefreshKey((prev: number) => prev + 1), 2000)
                        }
                    }).catch(console.error)
                }
                setMessages((prev: ChatMessage[]) =>
                    prev.map((m: ChatMessage) => {
                        if (m.id !== assistantMsgId) return m
                        const toolExecs = [...(m.toolExecutions || [])]
                        let lastRunning = -1
                        for (let idx = toolExecs.length - 1; idx >= 0; idx--) {
                            if (toolExecs[idx].status === "running") { lastRunning = idx; break }
                        }
                        if (lastRunning >= 0) {
                            toolExecs[lastRunning] = {
                                ...toolExecs[lastRunning],
                                status: "complete" as const,
                                summary: event.summary,
                                filesChanged: event.files?.length,
                            }
                        }
                        return { ...m, toolExecutions: toolExecs }
                    })
                )
                break

            case "error":
                setIsThinking(false)
                setMessages((prev: ChatMessage[]) =>
                    prev.map((m: ChatMessage) =>
                        m.id === assistantMsgId
                            ? { ...m, content: m.content + `\n\n⚠️ ${event.error}`, status: "done" as const }
                            : m
                    )
                )
                break

            case "done":
                setIsThinking(false)
                break
        }
    }

    const handleStop = () => {
        abortControllerRef.current?.abort()
        setIsStreaming(false)
        setIsThinking(false)
    }

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
    }
}

function saveMessages(jobId: string, messages: ChatMessage[]): void {
    try {
        const serializable = messages.map((m: ChatMessage) => ({
            ...m,
            images: m.images?.map((img: ImageAttachment) => ({ ...img, preview: img.preview.slice(0, 200) }))
        }))
        localStorage.setItem(`remix-chat-${jobId}`, JSON.stringify(serializable))
    } catch { /* quota exceeded, no-op */ }
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
