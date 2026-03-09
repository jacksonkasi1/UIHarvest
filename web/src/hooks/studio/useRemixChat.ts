import { useState, useEffect, useRef } from "react"
import type { Dispatch, SetStateAction } from "react"
import type { GeneratedFile, ChatMessage, ImageAttachment, ChatEvent } from "@/types/studio"
import { writeFiles, installPackages } from "@/lib/webcontainer"

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
            toolExecutions: []
        }
        setMessages((prev) => [...prev, assistantMsg])

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

            const res = await fetch(`/api/remix/${jobId}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Unknown error" }))
                setMessages((prev) =>
                    prev.map((m) =>
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
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMsgId
                            ? { ...m, content: m.content || "_Stopped._", status: "done" as const }
                            : m
                    )
                )
            } else {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMsgId
                            ? { ...m, content: `Error: ${(err as Error).message}`, status: "done" as const }
                            : m
                    )
                )
            }
        } finally {
            setIsStreaming(false)
            setIsThinking(false)
            setMessages((prev) =>
                prev.map((m) =>
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
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantMsgId
                            ? { ...m, content: event.content || "", status: event.partial ? "streaming" as const : "done" as const }
                            : m
                    )
                )
                break

            case "tool_start":
                setIsThinking(false)
                setMessages((prev) =>
                    prev.map((m) => {
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
                    setFiles(event.files)
                    if (containerReady) {
                        writeFiles(event.files, (wEvent) => {
                            setContainerLogs((prev) => [...prev.slice(-200), `[${wEvent.type}] ${wEvent.message}`])
                        }).catch(console.error)
                    }
                }
                if (event.packages && event.packages.length > 0 && containerReady) {
                    const pkgs = event.packages
                    setContainerLogs((prev) => [...prev.slice(-200), `[install] Auto-installing: ${pkgs.join(", ")}`])
                    installPackages(pkgs, (wEvent) => {
                        setContainerLogs((prev) => [...prev.slice(-200), `[${wEvent.type}] ${wEvent.message}`])
                    }).then((ok) => {
                        if (ok) {
                            setTimeout(() => setRefreshKey(prev => prev + 1), 2000)
                        }
                    }).catch(console.error)
                }
                setMessages((prev) =>
                    prev.map((m) => {
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
                setMessages((prev) =>
                    prev.map((m) =>
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
        const serializable = messages.map(m => ({
            ...m,
            images: m.images?.map(img => ({ ...img, preview: img.preview.slice(0, 200) })) // truncate previews for storage
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
