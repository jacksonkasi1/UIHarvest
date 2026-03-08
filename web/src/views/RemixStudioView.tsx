// ** import core packages
import { useEffect, useRef, useState, useCallback } from "react"
import {
    Loader2, CheckCircle, AlertCircle, Wand2, Monitor,
    Terminal, Eye, Code2, X,
    RefreshCw, Square, ChevronDown, ChevronRight, FileCode2,
    Sparkles, Zap, Palette, Layout, Type, MessageSquare, GlobeLock, Check, Plus, ArrowUp
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

// ** import components
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

// ** import lib
import { preWarmContainer, mountAndRunWithSnapshot, writeFiles, installPackages } from "@/lib/webcontainer"

// ** import components
import { CodeEditor } from "@/components/CodeEditor"

// ** import types
import type { ContainerEvent } from "@/lib/webcontainer"

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

interface RemixProgressEvent {
    phase: string
    message: string
    progress?: number
    error?: string
}

interface GeneratedFile {
    path: string
    content: string
}

interface ImageAttachment {
    data: string
    mimeType: string
    preview: string
    name: string
}

interface ChatEvent {
    type: "thinking" | "text" | "tool_start" | "tool_end" | "done" | "error"
    content?: string
    partial?: boolean
    tool?: string
    message?: string
    files?: GeneratedFile[]
    summary?: string
    error?: string
    packages?: string[]
}

interface ToolExecution {
    tool: string
    status: "running" | "complete" | "error"
    message: string
    summary?: string
    filesChanged?: number
}

interface ChatMessage {
    id: string
    role: "user" | "assistant"
    content: string
    images?: ImageAttachment[]
    timestamp: number
    status?: "pending" | "streaming" | "done"
    toolExecutions?: ToolExecution[]
}

interface RemixStudioProps {
    jobId: string
    onBack: () => void
}

// ════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════


type RightPanel = "preview" | "code" | "terminal"

const SUGGESTION_CHIPS = [
    { label: "Change colors", icon: Palette, prompt: "Change the primary color to a warm coral and adjust the overall color palette to feel more inviting" },
    { label: "Add a footer", icon: Layout, prompt: "Add a beautiful footer section with links, social media icons, and a newsletter signup" },
    { label: "Better typography", icon: Type, prompt: "Improve the typography hierarchy — make headings bolder, add better letter-spacing and line-height" },
    { label: "Add animations", icon: Zap, prompt: "Add subtle entrance animations and hover effects to make the page feel more alive" },
    { label: "Dark Mode", icon: Wand2, prompt: "Switch to a dark theme with rich, deep backgrounds and bright accent colors" }
]

// ════════════════════════════════════════════════════
// SESSION PERSISTENCE
// ════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════
// RELATIVE TIME
// ════════════════════════════════════════════════════

function relativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return "just now"
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
}

// ════════════════════════════════════════════════════
// TOOL EXECUTION CARD
// ════════════════════════════════════════════════════

function ToolExecutionCard({ exec }: { exec: ToolExecution }) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className="my-1.5 rounded-lg border border-gray-200 bg-white overflow-hidden transition-all duration-200 hover:border-gray-300 hover:shadow-sm">
            <button
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-[12px] transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                {exec.status === "running" ? (
                    <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-blue-100 animate-ping" />
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 relative" />
                    </div>
                ) : exec.status === "complete" ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                )}
                <FileCode2 className="h-3 w-3 text-gray-400" />
                <span className="flex-1 text-gray-700 font-medium truncate">
                    {exec.message}
                </span>
                {exec.filesChanged !== undefined && (
                    <span className="text-[11px] text-gray-400 font-mono shrink-0">
                        {exec.filesChanged} file{exec.filesChanged !== 1 ? "s" : ""}
                    </span>
                )}
                {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                )}
            </button>
            {expanded && exec.summary && (
                <div className="px-3 pb-2.5 pt-0 text-[11px] text-gray-600 border-t border-gray-100 mt-0">
                    <p className="pt-2 leading-relaxed">{exec.summary}</p>
                </div>
            )}
        </div>
    )
}

// ════════════════════════════════════════════════════
// MARKDOWN MESSAGE
// ════════════════════════════════════════════════════

function MarkdownContent({ content }: { content: string }) {
    return (
        <div className="prose prose-sm max-w-none text-[14px] leading-relaxed text-gray-800
            prose-p:my-1.5 prose-p:text-gray-700
            prose-headings:text-gray-900 prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:text-sm
            prose-code:text-blue-700 prose-code:bg-blue-50/50 prose-code:rounded-md prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[12px] prose-code:font-mono
            prose-pre:bg-gray-50 prose-pre:rounded-xl prose-pre:my-3 prose-pre:text-[12px] prose-pre:border prose-pre:border-gray-200
            prose-strong:text-gray-900 prose-strong:font-semibold
            prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-li:text-gray-700
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
            prose-blockquote:border-l-2 prose-blockquote:border-gray-200 prose-blockquote:text-gray-500 prose-blockquote:pl-4 prose-blockquote:my-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
            </ReactMarkdown>
        </div>
    )
}

// ════════════════════════════════════════════════════
// THINKING INDICATOR
// ════════════════════════════════════════════════════

function ThinkingIndicator() {
    return (
        <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 px-1 py-2">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                <Sparkles className="h-4 w-4 text-gray-400 animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
                <span className="text-[13px] text-gray-500 font-medium">Thought for a moment</span>
                <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
            </div>
        </div>
    )
}

// ════════════════════════════════════════════════════
// WELCOME STATE
// ════════════════════════════════════════════════════

function WelcomeState({
    containerReady,
    isBootingContainer,
    onSuggestionClick
}: {
    containerReady: boolean
    isBootingContainer: boolean
    onSuggestionClick: (prompt: string) => void
}) {
    return (
        <div className="space-y-6 animate-in fade-in duration-500 pt-2 px-1">
            <div className="space-y-4">
                <div className="font-semibold text-gray-900 text-base">
                    {containerReady ? "Your remix is live! 🎉" : isBootingContainer ? "Code generated!" : "Your remix is ready!"}
                </div>
                <div className="text-[14px] text-gray-600 leading-relaxed">
                    {containerReady
                        ? "I'll create a stunning workspace inspired by clean, modern design principles. Chat with me about anything, or ask me to make changes — colors, layout, sections, typography, animations."
                        : isBootingContainer
                            ? "Starting the live preview environment… I'll be ready in just a moment."
                            : "Ask me to make changes — I can modify anything."}
                </div>
            </div>

            {/* Suggestion chips */}
            {containerReady && (
                <div className="pt-2 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-200">
                    <p className="text-[12px] text-gray-800 font-semibold mb-3">Features for V1:</p>
                    <div className="flex flex-col gap-2 relative z-0">
                        {SUGGESTION_CHIPS.map((chip) => (
                            <button
                                key={chip.label}
                                className="flex items-center gap-3 w-full text-left text-[13px] text-gray-600 hover:text-gray-900 group"
                                onClick={() => onSuggestionClick(chip.prompt)}
                            >
                                <span className="w-1 h-1 rounded-full bg-gray-300 group-hover:bg-gray-500 transition-colors" />
                                {chip.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ════════════════════════════════════════════════════
// REMIX STUDIO VIEW
// ════════════════════════════════════════════════════

export function RemixStudioView({ jobId, onBack }: RemixStudioProps) {
    // ── State ────────────────────────────────────────────────────────────
    const [phase, setPhase] = useState("init")
    const [progress, setProgress] = useState(0)
    const [statusMessage, setStatusMessage] = useState("Starting remix…")
    const [error, setError] = useState<string | null>(null)
    const [files, setFiles] = useState<GeneratedFile[]>([])
    const [selectedFile, setSelectedFile] = useState<string | null>(null)

    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [chatInput, setChatInput] = useState("")
    const [isStreaming, setIsStreaming] = useState(false)
    const [isThinking, setIsThinking] = useState(false)
    const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const abortControllerRef = useRef<AbortController | null>(null)

    const [viewportSize] = useState<"desktop" | "tablet" | "mobile">("desktop")
    const [rightPanel, setRightPanel] = useState<RightPanel>("preview")
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [containerReady, setContainerReady] = useState(false)
    const [containerLogs, setContainerLogs] = useState<string[]>([])
    const [isBootingContainer, setIsBootingContainer] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)
    const [isFullscreen] = useState(false)

    const chatEndRef = useRef<HTMLDivElement>(null)
    const eventSourceRef = useRef<EventSource | null>(null)
    const teardownRef = useRef<(() => void) | null>(null)
    const terminalEndRef = useRef<HTMLDivElement>(null)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const chatInputRef = useRef<HTMLInputElement>(null)
    const bootingTerminalEndRef = useRef<HTMLDivElement>(null)

    const isReady = phase === "ready"
    const isError = phase === "error"
    const viewportWidths = { desktop: "100%", tablet: "768px", mobile: "375px" }

    // ── Load persisted messages on mount ─────────────────────────────────
    useEffect(() => {
        const saved = loadMessages(jobId)
        if (saved.length > 0) {
            setMessages(saved)
        }
    }, [jobId])

    // ── Persist messages on change ──────────────────────────────────────
    useEffect(() => {
        if (messages.length > 0) {
            saveMessages(jobId, messages)
        }
    }, [messages, jobId])

    // ── Container event handler ──────────────────────────────────────────
    const onContainerEvent = useCallback((event: ContainerEvent) => {
        const logLine = `[${event.type}] ${event.message}`
        setContainerLogs((prev) => [...prev.slice(-200), logLine])

        if (event.type === "server-ready" && event.url) {
            setPreviewUrl(event.url)
            setContainerReady(true)
            setIsBootingContainer(false)
        }
        if (event.type === "error") {
            setError(event.message)
            setIsBootingContainer(false)
        }
    }, [])

    // ── Pre-warm WebContainer immediately on mount ──────────────────────
    // This boots WC and installs base deps IN PARALLEL with AI code generation
    useEffect(() => {
        preWarmContainer(onContainerEvent).catch(console.error)
    }, [onContainerEvent])

    // ── WebContainer boot (with snapshot support) ───────────────────────
    const bootContainer = useCallback(async (filesToMount: GeneratedFile[]) => {
        if (isBootingContainer || containerReady) return
        setIsBootingContainer(true)

        const result = await mountAndRunWithSnapshot(jobId, filesToMount, onContainerEvent)
        teardownRef.current = result.teardown

        if (result.previewUrl) {
            setPreviewUrl(result.previewUrl)
            setContainerReady(true)
        }
        setIsBootingContainer(false)
    }, [isBootingContainer, containerReady, jobId, onContainerEvent])

    // ── SSE progress stream ─────────────────────────────────────────────
    useEffect(() => {
        const es = new EventSource(`/api/remix/${jobId}/progress`)
        eventSourceRef.current = es

        es.onmessage = (e) => {
            try {
                const event: RemixProgressEvent = JSON.parse(e.data)
                setPhase(event.phase)
                setStatusMessage(event.message)
                if (event.progress !== undefined) setProgress(event.progress)
                if (event.error) setError(event.error)
                if (event.phase === "ready") fetchFiles()
            } catch { }
        }

        es.onerror = () => es.close()

        return () => {
            es.close()
            teardownRef.current?.()
        }
    }, [jobId])

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, isThinking])

    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [containerLogs])

    useEffect(() => {
        if (isBootingContainer) {
            bootingTerminalEndRef.current?.scrollIntoView({ behavior: "smooth" })
        }
    }, [containerLogs, isBootingContainer])

    const fetchFiles = async () => {
        try {
            const res = await fetch(`/api/remix/${jobId}/files`)
            if (res.ok) {
                const data = await res.json()
                const fetchedFiles: GeneratedFile[] = data.files ?? []
                setFiles(fetchedFiles)
                const appFile = fetchedFiles.find((f) => f.path === "src/App.tsx")
                if (appFile) setSelectedFile(appFile.path)
                if (fetchedFiles.length > 0) bootContainer(fetchedFiles)
            }
        } catch { }
    }

    const handleRefreshPreview = () => setRefreshKey(prev => prev + 1)

    const handleFileEdit = (path: string, newContent: string) => {
        setFiles(prev => prev.map(f => (f.path === path ? { ...f, content: newContent } : f)))
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(() => {
            if (containerReady) writeFiles([{ path, content: newContent }]).catch(console.error)
        }, 1000)
    }

    // ── Image helpers ────────────────────────────────────────────────────
    const fileToBase64 = (file: File): Promise<ImageAttachment> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
                const dataUrl = reader.result as string
                resolve({
                    data: dataUrl.split(",")[1],
                    mimeType: file.type,
                    preview: dataUrl,
                    name: file.name,
                })
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
        })
    }

    const handleImageFiles = async (fileList: FileList | File[]) => {
        const imageFiles = Array.from(fileList).filter((f) =>
            f.type.startsWith("image/")
        ).slice(0, 5 - attachedImages.length)
        const newImages = await Promise.all(imageFiles.map(fileToBase64))
        setAttachedImages((prev) => [...prev, ...newImages].slice(0, 5))
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items
        if (!items) return
        const imageFiles: File[] = []
        for (const item of items) {
            if (item.type.startsWith("image/")) {
                const file = item.getAsFile()
                if (file) imageFiles.push(file)
            }
        }
        if (imageFiles.length > 0) {
            e.preventDefault()
            handleImageFiles(imageFiles)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        if (e.dataTransfer?.files) handleImageFiles(e.dataTransfer.files)
    }

    const removeImage = (index: number) => {
        setAttachedImages((prev) => prev.filter((_, i) => i !== index))
    }

    const handleStop = () => {
        abortControllerRef.current?.abort()
        setIsStreaming(false)
        setIsThinking(false)
    }

    // ── Suggestion chip handler ─────────────────────────────────────────
    const handleSuggestionClick = (prompt: string) => {
        setChatInput(prompt)
        // Focus input + auto-send
        setTimeout(() => {
            chatInputRef.current?.focus()
        }, 50)
    }

    // ── Streaming Chat ──────────────────────────────────────────────────
    const handleSendMessage = async () => {
        const prompt = chatInput.trim()
        if (!prompt || isStreaming) return

        const currentImages = [...attachedImages]
        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: prompt,
            images: currentImages.length > 0 ? currentImages : undefined,
            timestamp: Date.now(),
            status: "done"
        }

        setChatInput("")
        setAttachedImages([])
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
            const body: Record<string, unknown> = { prompt }
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
                            // Update existing running tool message
                            toolExecs[lastRunning] = {
                                ...toolExecs[lastRunning],
                                message: event.message || "Processing..."
                            }
                        } else {
                            // Add new running tool
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
                // Auto-install detected packages in WebContainer
                if (event.packages && event.packages.length > 0 && containerReady) {
                    const pkgs = event.packages
                    setContainerLogs((prev) => [...prev.slice(-200), `[install] Auto-installing: ${pkgs.join(", ")}`])
                    installPackages(pkgs, (wEvent) => {
                        setContainerLogs((prev) => [...prev.slice(-200), `[${wEvent.type}] ${wEvent.message}`])
                    }).then((ok) => {
                        if (ok) {
                            // Refresh preview after package install
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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    const handleDownloadAll = () => {
        const content = files.map((f) => `// ═══ ${f.path} ═══\n${f.content}`).join("\n\n")
        const blob = new Blob([content], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `remix-${jobId}.txt`
        a.click()
        URL.revokeObjectURL(url)
    }

    // ════════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════════

    return (
        <div className="flex h-dvh w-full flex-col bg-[#FAFAF9] text-gray-900 overflow-hidden font-sans">
            {/* ── Top bar ─────────────────────────────────────────────── */}
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 relative z-20">
                <div className="flex items-center gap-3 w-1/3 min-w-0">
                    <button
                        className="text-[13px] text-gray-400 hover:text-gray-900 transition-colors tracking-wide font-medium flex items-center gap-1 focus:outline-none"
                        onClick={onBack}
                    >
                        &larr;
                    </button>
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[14px] font-medium tracking-tight text-gray-900 truncate flex shrink-0">
                            Studio Workspace
                        </span>
                        <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
                        <span className="text-[13px] text-gray-400 truncate">
                            {isReady ? "Ready to edit" :
                                isBootingContainer ? "Loading Live Preview..." : statusMessage}
                        </span>
                    </div>
                </div>

                <div className="flex-1 flex justify-center">
                    {isReady && (
                        <div className="flex items-center gap-1">
                            <button
                                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${rightPanel === "preview" ? "bg-gray-100 text-gray-900 shadow-sm border border-gray-200/60" : "text-gray-500 hover:text-gray-900"}`}
                                onClick={() => setRightPanel("preview")}
                            >
                                <Eye className="h-4 w-4" />
                                Preview
                            </button>
                            <button
                                className={`flex items-center justify-center rounded-lg p-1.5 transition-colors ${rightPanel === "code" ? "bg-gray-100 text-gray-900 shadow-sm border border-gray-200/60" : "text-gray-400 hover:text-gray-900"}`}
                                onClick={() => setRightPanel("code")}
                            >
                                <Code2 className="h-4 w-4" />
                            </button>
                            <button
                                className={`flex items-center justify-center rounded-lg p-1.5 transition-colors ${rightPanel === "terminal" ? "bg-gray-100 text-gray-900 shadow-sm border border-gray-200/60" : "text-gray-400 hover:text-gray-900"}`}
                                onClick={() => setRightPanel("terminal")}
                            >
                                <Terminal className="h-4 w-4" />
                            </button>
                            <div className="w-px h-4 bg-gray-200 mx-2" />
                            <button
                                className="flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:text-gray-900 transition-colors"
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3 w-1/3 shrink-0 justify-end">
                    {isReady && rightPanel === "preview" && previewUrl && (
                        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-md px-2 py-1 mr-2 text-[12px] text-gray-500 font-mono">
                            <Monitor className="w-3 h-3 mr-1.5 opacity-60" />
                            <span className="truncate max-w-[120px]">{previewUrl.replace(/^https?:\/\//, '')}</span>
                            <button className="ml-1 hover:text-gray-900 text-gray-400"><RefreshCw className="w-3 h-3 ml-2" onClick={handleRefreshPreview} /></button>
                        </div>
                    )}

                    <button className="text-[13px] font-medium text-gray-600 hover:text-gray-900 px-2 py-1 flex items-center gap-1.5 transition-colors">
                        Share <GlobeLock className="h-3.5 w-3.5 opacity-50" />
                    </button>
                    {isReady && (
                        <Button size="sm" className="h-8 px-4 text-[13px] bg-[#2563eb] hover:bg-blue-700 text-white border-0 rounded-[0.4rem] font-medium transition-all shadow-sm" onClick={handleDownloadAll}>
                            Publish
                        </Button>
                    )}
                </div>
            </header>

            {/* Error banner */}
            {isError && error && (
                <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-[13px] text-red-600 flex items-center justify-between z-20 relative font-medium">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="hover:bg-red-100 p-1 rounded-md transition-colors"><X className="h-4 w-4" /></button>
                </div>
            )}

            {/* Progress bar */}
            {!isReady && !isError && (
                <div className="h-[2px] w-full bg-blue-50/50 relative z-20">
                    <div
                        className="h-full bg-blue-500 transition-all duration-700 ease-out"
                        style={{ width: `${Math.max(progress * 100, 2)}%` }}
                    />
                </div>
            )}

            {/* ── Main content ──────────────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden relative">

                {/* Left: Chat */}
                {!isFullscreen && (
                    <div className="flex w-[380px] shrink-0 flex-col bg-[#FAFAF9] relative z-10 border-r border-gray-200">
                        <ScrollArea className="flex-1 p-5 pb-0">
                            <div className="space-y-6 pb-6">
                                {/* Welcome state */}
                                {isReady && messages.length === 0 && (
                                    <WelcomeState
                                        containerReady={containerReady}
                                        isBootingContainer={isBootingContainer}
                                        onSuggestionClick={handleSuggestionClick}
                                    />
                                )}

                                {/* Chat messages */}
                                {messages.map((msg, msgIdx) => (
                                    <div
                                        key={msg.id}
                                        className={`flex flex-col gap-1 w-full relative z-0 ${msg.role === "user" ? "items-end" : "items-start"}`}
                                        style={{ animationDelay: `${msgIdx * 30}ms` }}
                                    >
                                        {/* Message bubble */}
                                        <div className={`w-fit max-w-[90%] px-1 ${msg.role === "user"
                                            ? "bg-gray-100/80 px-4 py-3 rounded-2xl rounded-tr-sm text-gray-900 text-[14px]"
                                            : "text-gray-800"
                                            }`}>
                                            {/* User images */}
                                            {msg.images && msg.images.length > 0 && (
                                                <div className="flex gap-2 mb-3 flex-wrap">
                                                    {msg.images.map((img, i) => (
                                                        <img
                                                            key={i}
                                                            src={img.preview}
                                                            alt={img.name}
                                                            className="h-16 w-16 rounded-lg object-cover border border-gray-200 shadow-sm"
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                            {/* Tool cards */}
                                            {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                                                <div className="mb-4 space-y-2 mt-2">
                                                    <div className="flex items-center gap-2 text-[12px] font-medium text-gray-500 mb-1 px-1">
                                                        <FileCode2 className="w-3.5 h-3.5" />
                                                        <span>{msg.toolExecutions.length} edit{msg.toolExecutions.length !== 1 ? 's' : ''} applied</span>
                                                    </div>
                                                    {msg.toolExecutions.map((exec, i) => (
                                                        <ToolExecutionCard key={i} exec={exec} />
                                                    ))}
                                                </div>
                                            )}
                                            {/* Message content */}
                                            {msg.role === "assistant" && msg.content ? (
                                                <MarkdownContent content={msg.content} />
                                            ) : (
                                                <span className="text-[14px] leading-relaxed block whitespace-pre-wrap">{msg.content}</span>
                                            )}
                                            {msg.status === "streaming" && (
                                                <span className="inline-block w-1.5 h-3.5 bg-gray-400 animate-pulse ml-1 align-middle" />
                                            )}
                                        </div>
                                        {/* Timestamp */}
                                        <span className="text-[10px] text-gray-400 px-2 font-medium tracking-wide">
                                            {msg.status === "done" && msg.role !== 'assistant' && <Check className="inline h-3 w-3 mr-0.5 text-gray-300" />}
                                            {relativeTime(msg.timestamp)}
                                        </span>
                                    </div>
                                ))}

                                {isThinking && <ThinkingIndicator />}
                                <div ref={chatEndRef} />
                            </div>
                        </ScrollArea>

                        {/* ── Chat input ──────────────────────────────────── */}
                        <div
                            className="bg-[#FAFAF9]"
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    if (e.target.files) handleImageFiles(e.target.files)
                                    e.target.value = ""
                                }}
                            />

                            {/* Pinned Input Container */}
                            <div className="mx-4 mb-4 mt-2 bg-white rounded-3xl p-1.5 border border-gray-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] focus-within:shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-all">
                                {attachedImages.length > 0 && (
                                    <div className="p-2 pb-1 flex gap-2 flex-wrap">
                                        {attachedImages.map((img, i) => (
                                            <div key={i} className="relative group">
                                                <img src={img.preview} alt={img.name} className="h-10 w-10 rounded-lg object-cover border border-gray-200 shadow-sm" />
                                                <button
                                                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 shadow-md"
                                                    onClick={() => removeImage(i)}
                                                >
                                                    <X className="h-2.5 w-2.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex flex-col gap-1 w-full py-1">
                                    <input
                                        ref={chatInputRef}
                                        className="w-full bg-transparent border-none text-[14px] py-1.5 px-3 text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                        placeholder={isReady ? "Ask Workspace..." : "Waiting..."}
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        onPaste={handlePaste}
                                        disabled={!isReady || isStreaming}
                                    />

                                    <div className="flex items-center justify-between px-2 pt-1">
                                        <div className="flex gap-1.5">
                                            <button className="flex items-center justify-center p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors font-medium">
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                            <button className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold tracking-wide text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
                                                <Sparkles className="w-3 h-3" />
                                                Visual edits
                                            </button>
                                        </div>
                                        <div className="flex gap-1.5">
                                            <button className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold tracking-wide text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
                                                <MessageSquare className="w-3 h-3" />
                                                Chat
                                            </button>
                                            {isStreaming ? (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-7 w-7 rounded-full bg-gray-100 text-gray-900 hover:bg-gray-200 transition-all"
                                                    onClick={handleStop}
                                                >
                                                    <Square className="h-3 w-3 fill-current" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className={`h-7 w-7 rounded-full bg-black text-white hover:bg-gray-800 transition-all disabled:opacity-20`}
                                                    disabled={!isReady || !chatInput.trim()}
                                                    onClick={handleSendMessage}
                                                >
                                                    <ArrowUp className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Right panel ────────────────────────────────────── */}
                <div className="flex flex-1 flex-col overflow-hidden relative z-10 bg-[#F5F5F5]">
                    {rightPanel === "preview" && (
                        <div className="flex-1 flex items-center justify-center overflow-auto p-8 lg:p-12 h-full relative">
                            {previewUrl ? (
                                <div
                                    className="h-full max-h-[900px] transition-all duration-300 ease-in-out bg-white rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.02)] overflow-hidden border border-gray-200/60 ring-1 ring-gray-900/5"
                                    style={{ width: viewportWidths[viewportSize] }}
                                >
                                    <iframe
                                        key={refreshKey}
                                        src={previewUrl}
                                        className="h-full w-full border-0"
                                        title="Remix Preview"
                                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads align-top bg-white"
                                    />
                                </div>
                            ) : isBootingContainer ? (
                                <div className="bg-white rounded-full px-5 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-3">
                                    <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
                                    <span className="text-[13px] font-medium text-gray-600">Getting ready...</span>
                                </div>
                            ) : (
                                <div className="bg-white rounded-full px-5 py-3 shadow-[0_4px_16px_rgba(0,0,0,0.04)] border border-gray-100 flex items-center gap-3">
                                    <Wand2 className="h-4 w-4 text-gray-400" />
                                    <span className="text-[13px] font-medium text-gray-600">Crafting your site...</span>
                                </div>
                            )}
                        </div>
                    )}

                    {rightPanel === "code" && (
                        <div className="flex-1 bg-white border border-gray-200 m-4 rounded-xl shadow-sm overflow-hidden">
                            <CodeEditor
                                files={files}
                                selectedFile={selectedFile}
                                onSelectFile={setSelectedFile}
                                onFileChange={handleFileEdit}
                            />
                        </div>
                    )}

                    {rightPanel === "terminal" && (
                        <div className="flex-1 overflow-auto bg-gray-900 m-4 rounded-xl p-5 font-mono text-[12px] leading-relaxed shadow-inner">
                            {containerLogs.length === 0 ? (
                                <p className="text-gray-500 italic">Terminal output appears when WebContainer boots…</p>
                            ) : (
                                containerLogs.map((log, i) => {
                                    let color = "text-gray-400"
                                    if (log.includes("[error]")) color = "text-red-400"
                                    else if (log.includes("[server-ready]")) color = "text-emerald-400"
                                    else if (log.includes("[install]")) color = "text-blue-400"
                                    else color = "text-gray-300"
                                    return (
                                        <div key={i} className={`font-mono ${color}`}>{log}</div>
                                    )
                                })
                            )}
                            <div ref={terminalEndRef} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
