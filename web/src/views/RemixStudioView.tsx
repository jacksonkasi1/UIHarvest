// ** import core packages
import { useEffect, useRef, useState, useCallback } from "react"
import {
    Send, Download, Loader2, CheckCircle, AlertCircle,
    Bot, User, Wand2, Monitor, Tablet, Smartphone,
    Play, Terminal, Eye, Code2, X, ImagePlus, Paperclip,
    RefreshCw, Square, ChevronDown, ChevronRight, FileCode2,
    Sparkles, Zap, Palette, Layout, Type, MessageSquare,
    Maximize2, ExternalLink, Clock
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

const PHASE_LABELS: Record<string, string> = {
    init: "Initializing…",
    "extracting-reference": "Analyzing reference…",
    "extracting-target": "Extracting brand…",
    "building-spec": "Building spec…",
    "generating-scaffold": "Scaffolding…",
    "generating-pages": "Generating code…",
    ready: "Ready",
    iterating: "Applying changes…",
    error: "Error",
}

type RightPanel = "preview" | "code" | "terminal"

const SUGGESTION_CHIPS = [
    { label: "Change colors", icon: Palette, prompt: "Change the primary color to a warm coral and adjust the overall color palette to feel more inviting" },
    { label: "Add a footer", icon: Layout, prompt: "Add a beautiful footer section with links, social media icons, and a newsletter signup" },
    { label: "Better typography", icon: Type, prompt: "Improve the typography hierarchy — make headings bolder, add better letter-spacing and line-height" },
    { label: "Add animations", icon: Zap, prompt: "Add subtle entrance animations and hover effects to make the page feel more alive" },
    { label: "Make it darker", icon: Wand2, prompt: "Switch to a dark theme with rich, deep backgrounds and bright accent colors" },
    { label: "What can you do?", icon: MessageSquare, prompt: "What kind of changes can you help me make to this website?" },
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
        <div className="my-1.5 rounded-lg border border-border/30 bg-background/50 backdrop-blur-sm overflow-hidden transition-all duration-200 hover:border-border/50">
            <button
                className="flex items-center gap-2 w-full px-3 py-2 text-left text-[11px] transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                {exec.status === "running" ? (
                    <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary relative" />
                    </div>
                ) : exec.status === "complete" ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                )}
                <FileCode2 className="h-3 w-3 text-muted-foreground/60" />
                <span className="flex-1 text-foreground/80 font-medium truncate">
                    {exec.message}
                </span>
                {exec.filesChanged !== undefined && (
                    <span className="text-[10px] text-primary/70 font-mono shrink-0">
                        {exec.filesChanged} file{exec.filesChanged !== 1 ? "s" : ""}
                    </span>
                )}
                {expanded ? (
                    <ChevronDown className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                )}
            </button>
            {expanded && exec.summary && (
                <div className="px-3 pb-2.5 pt-0 text-[10px] text-muted-foreground/80 border-t border-border/20 mt-0">
                    <p className="pt-1.5 leading-relaxed">{exec.summary}</p>
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
        <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed
            prose-p:my-1 prose-p:text-foreground/80
            prose-headings:text-foreground prose-headings:mt-2 prose-headings:mb-1 prose-headings:text-sm
            prose-code:text-primary/90 prose-code:bg-primary/8 prose-code:rounded-md prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[11px] prose-code:font-mono
            prose-pre:bg-[#111] prose-pre:rounded-lg prose-pre:my-2 prose-pre:text-[11px] prose-pre:border prose-pre:border-border/20
            prose-strong:text-foreground prose-strong:font-semibold
            prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-li:text-foreground/75
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-blockquote:border-primary/30 prose-blockquote:text-muted-foreground">
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
        <div className="flex gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10">
                <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
            </div>
            <div className="rounded-xl bg-muted/20 border border-border/20 px-4 py-2.5 text-xs text-muted-foreground flex items-center gap-3">
                <div className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-muted-foreground/60 text-[11px]">Thinking…</span>
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
        <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex gap-2.5">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="space-y-2">
                    <div className="rounded-xl bg-muted/20 border border-border/20 px-4 py-3 text-[13px] text-foreground/80 leading-relaxed">
                        {containerReady ? (
                            <>
                                <p className="font-medium text-foreground mb-1">Your remix is live! 🎉</p>
                                <p className="text-muted-foreground text-xs">Chat with me about anything, or ask me to make changes — colors, layout, sections, typography, animations.</p>
                            </>
                        ) : isBootingContainer ? (
                            <>
                                <p className="font-medium text-foreground mb-1">Code generated!</p>
                                <p className="text-muted-foreground text-xs">Starting the live preview environment…</p>
                            </>
                        ) : (
                            <>
                                <p className="font-medium text-foreground mb-1">Your remix is ready!</p>
                                <p className="text-muted-foreground text-xs">Ask me to make changes — I can modify anything.</p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Suggestion chips */}
            {containerReady && (
                <div className="pl-9 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-200">
                    <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium mb-2">Try asking</p>
                    <div className="flex flex-wrap gap-1.5">
                        {SUGGESTION_CHIPS.map((chip) => (
                            <button
                                key={chip.label}
                                className="flex items-center gap-1.5 rounded-full border border-border/30 bg-background/50 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 backdrop-blur-sm"
                                onClick={() => onSuggestionClick(chip.prompt)}
                            >
                                <chip.icon className="h-3 w-3" />
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

    const [viewportSize, setViewportSize] = useState<"desktop" | "tablet" | "mobile">("desktop")
    const [rightPanel, setRightPanel] = useState<RightPanel>("preview")
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [containerReady, setContainerReady] = useState(false)
    const [containerLogs, setContainerLogs] = useState<string[]>([])
    const [isBootingContainer, setIsBootingContainer] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)
    const [isFullscreen, setIsFullscreen] = useState(false)

    const chatEndRef = useRef<HTMLDivElement>(null)
    const eventSourceRef = useRef<EventSource | null>(null)
    const teardownRef = useRef<(() => void) | null>(null)
    const terminalEndRef = useRef<HTMLDivElement>(null)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const chatInputRef = useRef<HTMLInputElement>(null)

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
        <div className="flex h-dvh w-full flex-col bg-background text-foreground overflow-hidden">
            {/* ── Top bar ─────────────────────────────────────────────── */}
            <header className="flex h-11 shrink-0 items-center justify-between border-b border-border/30 bg-card/60 px-4 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <button
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={onBack}
                    >
                        ← Back
                    </button>
                    <div className="h-3.5 w-px bg-border/50" />
                    <div className="flex items-center gap-1.5">
                        <div className="h-5 w-5 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                            <Wand2 className="h-3 w-3 text-primary" />
                        </div>
                        <span className="text-sm font-medium">Remix Studio</span>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {isReady && (
                        <div className="flex items-center rounded-lg border border-border/30 p-0.5 bg-background/50">
                            {(["preview", "code", "terminal"] as const).map((panel) => {
                                const Icon = panel === "preview" ? Eye : panel === "code" ? Code2 : Terminal
                                return (
                                    <button
                                        key={panel}
                                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all duration-150 ${rightPanel === panel ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                                        onClick={() => setRightPanel(panel)}
                                    >
                                        <Icon className="h-3 w-3" />
                                        <span className="capitalize">{panel}</span>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {isReady && rightPanel === "preview" && (
                        <>
                            <div className="flex items-center rounded-lg border border-border/30 p-0.5 bg-background/50">
                                {([
                                    { key: "desktop" as const, Icon: Monitor },
                                    { key: "tablet" as const, Icon: Tablet },
                                    { key: "mobile" as const, Icon: Smartphone },
                                ]).map(({ key, Icon }) => (
                                    <button
                                        key={key}
                                        className={`rounded-md p-1 transition-all duration-150 ${viewportSize === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                                        onClick={() => setViewportSize(key)}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                    </button>
                                ))}
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={handleRefreshPreview} title="Refresh">
                                <RefreshCw className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => setIsFullscreen(!isFullscreen)} title="Fullscreen">
                                <Maximize2 className="h-3 w-3" />
                            </Button>
                            {previewUrl && (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => {
                                    navigator.clipboard.writeText(previewUrl).catch(() => { })
                                    // Brief visual feedback
                                    const btn = document.activeElement as HTMLButtonElement
                                    if (btn) {
                                        btn.title = "Copied!"
                                        setTimeout(() => { btn.title = "Copy preview URL" }, 1500)
                                    }
                                }} title="Copy preview URL">
                                    <ExternalLink className="h-3 w-3" />
                                </Button>
                            )}
                        </>
                    )}

                    {isReady && (
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px] border-border/30" onClick={handleDownloadAll}>
                            <Download className="h-3 w-3" />
                            Export
                        </Button>
                    )}

                    <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${isError ? "bg-destructive/10 text-destructive" :
                        isReady ? "bg-emerald-500/10 text-emerald-500" :
                            "bg-primary/10 text-primary"
                        }`}>
                        {isError ? <AlertCircle className="h-2.5 w-2.5" /> :
                            isReady ? <CheckCircle className="h-2.5 w-2.5" /> :
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                        {PHASE_LABELS[phase] ?? phase}
                    </div>
                </div>
            </header>

            {/* Error banner */}
            {isError && error && (
                <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError(null)}><X className="h-3 w-3" /></button>
                </div>
            )}

            {/* Progress bar */}
            {!isReady && !isError && (
                <div className="h-px w-full bg-border/20">
                    <div
                        className="h-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-700 ease-out"
                        style={{ width: `${Math.max(progress * 100, 2)}%` }}
                    />
                </div>
            )}

            {/* ── Main content ──────────────────────────────────────────── */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Chat — hidden in fullscreen preview */}
                {!isFullscreen && (
                    <div className="flex w-[360px] shrink-0 flex-col border-r border-border/30 bg-card/20">
                        <ScrollArea className="flex-1 p-4">
                            <div className="space-y-4">
                                {/* Generation progress */}
                                {!isReady && !isError && (
                                    <div className="flex gap-2.5">
                                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10">
                                            <Bot className="h-3.5 w-3.5 text-primary" />
                                        </div>
                                        <div className="rounded-xl bg-muted/20 border border-border/20 px-4 py-2.5 text-xs text-muted-foreground">
                                            <Loader2 className="h-3 w-3 animate-spin inline mr-1.5" />
                                            {statusMessage}
                                        </div>
                                    </div>
                                )}

                                {/* Welcome state */}
                                {isReady && messages.length === 0 && (
                                    <WelcomeState
                                        containerReady={containerReady}
                                        isBootingContainer={isBootingContainer}
                                        onSuggestionClick={handleSuggestionClick}
                                    />
                                )}

                                {/* WebContainer booting chip */}
                                {isBootingContainer && (
                                    <div className="flex gap-2.5">
                                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/10">
                                            <Play className="h-3.5 w-3.5 text-amber-500" />
                                        </div>
                                        <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 px-4 py-2.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            Booting preview environment…
                                        </div>
                                    </div>
                                )}

                                {/* Chat messages */}
                                {messages.map((msg, msgIdx) => (
                                    <div
                                        key={msg.id}
                                        className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                                        style={{ animationDelay: `${msgIdx * 30}ms` }}
                                    >
                                        {/* Avatar */}
                                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${msg.role === "user"
                                            ? "bg-foreground/8 ring-1 ring-foreground/5"
                                            : "bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10"
                                            }`}>
                                            {msg.role === "user" ? (
                                                <User className="h-3.5 w-3.5 text-foreground/60" />
                                            ) : (
                                                <Bot className="h-3.5 w-3.5 text-primary" />
                                            )}
                                        </div>

                                        {/* Message bubble */}
                                        <div className="flex flex-col gap-0.5 max-w-[280px]">
                                            <div className={`rounded-xl px-3.5 py-2.5 ${msg.role === "user"
                                                ? "bg-primary/10 border border-primary/10 text-foreground text-[13px]"
                                                : "bg-muted/15 border border-border/15 text-foreground/85"
                                                }`}>
                                                {/* User images */}
                                                {msg.images && msg.images.length > 0 && (
                                                    <div className="flex gap-1.5 mb-2 flex-wrap">
                                                        {msg.images.map((img, i) => (
                                                            <img
                                                                key={i}
                                                                src={img.preview}
                                                                alt={img.name}
                                                                className="h-16 w-16 rounded-lg object-cover border border-border/20"
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                                {/* Tool cards */}
                                                {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                                                    <div className="mb-2">
                                                        {msg.toolExecutions.map((exec, i) => (
                                                            <ToolExecutionCard key={i} exec={exec} />
                                                        ))}
                                                    </div>
                                                )}
                                                {/* Message content */}
                                                {msg.role === "assistant" && msg.content ? (
                                                    <MarkdownContent content={msg.content} />
                                                ) : (
                                                    <span className="text-[13px] leading-relaxed">{msg.content}</span>
                                                )}
                                                {msg.status === "streaming" && (
                                                    <span className="inline-block w-0.5 h-4 bg-primary/60 animate-pulse ml-0.5 rounded-full align-text-bottom" />
                                                )}
                                            </div>
                                            {/* Timestamp */}
                                            <span className={`text-[9px] text-muted-foreground/40 px-1 ${msg.role === "user" ? "text-right" : ""}`}>
                                                {msg.status === "done" && <Clock className="inline h-2 w-2 mr-0.5 align-[-1px]" />}
                                                {relativeTime(msg.timestamp)}
                                            </span>
                                        </div>
                                    </div>
                                ))}

                                {isThinking && <ThinkingIndicator />}
                                <div ref={chatEndRef} />
                            </div>
                        </ScrollArea>

                        {/* ── Chat input ──────────────────────────────────── */}
                        <div
                            className="border-t border-border/30 p-3 bg-background/50 backdrop-blur-sm"
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

                            {attachedImages.length > 0 && (
                                <div className="mb-2 flex gap-1.5 flex-wrap">
                                    {attachedImages.map((img, i) => (
                                        <div key={i} className="relative group">
                                            <img src={img.preview} alt={img.name} className="h-11 w-11 rounded-lg object-cover border border-border/30" />
                                            <button
                                                className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => removeImage(i)}
                                            >
                                                <X className="h-2.5 w-2.5" />
                                            </button>
                                        </div>
                                    ))}
                                    {attachedImages.length < 5 && (
                                        <button
                                            className="h-11 w-11 rounded-lg border border-dashed border-border/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <ImagePlus className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-1.5 items-center rounded-xl border border-border/30 bg-background/80 px-1 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/10 transition-all">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 text-muted-foreground/50 hover:text-foreground rounded-lg"
                                    disabled={!isReady}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Paperclip className="h-3.5 w-3.5" />
                                </Button>
                                <input
                                    ref={chatInputRef}
                                    className="flex-1 bg-transparent border-0 text-[13px] py-2 placeholder:text-muted-foreground/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                    placeholder={isReady ? "Chat or describe changes…" : "Waiting for generation…"}
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    onPaste={handlePaste}
                                    disabled={!isReady || isStreaming}
                                />
                                {isStreaming ? (
                                    <Button
                                        size="icon"
                                        variant="destructive"
                                        className="h-7 w-7 shrink-0 rounded-lg"
                                        onClick={handleStop}
                                    >
                                        <Square className="h-3 w-3" />
                                    </Button>
                                ) : (
                                    <Button
                                        size="icon"
                                        className="h-7 w-7 shrink-0 rounded-lg"
                                        disabled={!isReady || !chatInput.trim()}
                                        onClick={handleSendMessage}
                                    >
                                        <Send className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Right panel ────────────────────────────────────── */}
                <div className="flex flex-1 flex-col overflow-hidden">
                    {rightPanel === "preview" && (
                        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]">
                            {/* Preview URL bar */}
                            {previewUrl && (
                                <div className="flex items-center gap-2 h-8 px-3 border-b border-border/20 bg-[#111]">
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 rounded-full bg-red-500/60" />
                                        <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                                        <div className="w-2 h-2 rounded-full bg-green-500/60" />
                                    </div>
                                    <div className="flex-1 bg-[#1a1a1a] rounded-md px-3 py-0.5 text-[10px] text-muted-foreground/60 font-mono truncate border border-border/10">
                                        {previewUrl}
                                    </div>
                                </div>
                            )}
                            <div className="flex-1 flex items-center justify-center overflow-hidden">
                                {previewUrl ? (
                                    <div
                                        className="h-full transition-all duration-300 ease-out bg-white"
                                        style={{ width: viewportWidths[viewportSize] }}
                                    >
                                        <iframe
                                            key={refreshKey}
                                            src={previewUrl}
                                            className="h-full w-full border-0"
                                            title="Remix Preview"
                                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-3 text-center">
                                        {isBootingContainer ? (
                                            <>
                                                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                                <p className="text-sm text-muted-foreground">Starting live preview…</p>
                                                <p className="text-[10px] text-muted-foreground/40 font-mono">WebContainer → npm install → Vite</p>
                                            </>
                                        ) : !isReady ? (
                                            <>
                                                <Wand2 className="h-8 w-8 text-muted-foreground/20" />
                                                <p className="text-sm text-muted-foreground/60">Preview appears after code generation</p>
                                            </>
                                        ) : (
                                            <>
                                                <Eye className="h-8 w-8 text-muted-foreground/20" />
                                                <p className="text-sm text-muted-foreground/60">Loading preview…</p>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {rightPanel === "code" && (
                        <CodeEditor
                            files={files}
                            selectedFile={selectedFile}
                            onSelectFile={setSelectedFile}
                            onFileChange={handleFileEdit}
                        />
                    )}

                    {rightPanel === "terminal" && (
                        <div className="flex-1 overflow-auto bg-[#0a0a0a] p-4 font-mono text-[11px]">
                            {containerLogs.length === 0 ? (
                                <p className="text-white/15">Terminal output appears when WebContainer boots…</p>
                            ) : (
                                containerLogs.map((log, i) => (
                                    <div
                                        key={i}
                                        className={`leading-5 ${log.includes("[error]") ? "text-red-400" :
                                            log.includes("[server-ready]") ? "text-emerald-400" :
                                                "text-white/50"
                                            }`}
                                    >
                                        {log}
                                    </div>
                                ))
                            )}
                            <div ref={terminalEndRef} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
