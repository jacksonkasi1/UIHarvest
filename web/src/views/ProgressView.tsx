// ** import core packages
import { useEffect, useRef, useState } from "react"
import {
    Loader2,
    Download,
    Eye,
    ArrowLeft,
} from "lucide-react"

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

export interface ProgressEvent {
    phase:
    | "init"
    | "discovering"
    | "loading"
    | "extracting"
    | "screenshots"
    | "assets"
    | "vision"
    | "memory"
    | "done"
    | "error"
    | "reconnect"
    message: string
    progress?: number
    pageIndex?: number
    pageCount?: number
    summary?: Record<string, number | string>
    error?: string
}

// ════════════════════════════════════════════════════
// PHASE CONFIG
// ════════════════════════════════════════════════════

const PHASE_LABELS: Record<string, string> = {
    init: "Initializing",
    loading: "Loading Page",
    extracting: "Extracting Tokens",
    screenshots: "Taking Screenshots",
    assets: "Downloading Assets",
    vision: "AI Vision Pass",
    memory: "Generating Memory",
    done: "Complete",
    error: "Error",
}

const PHASE_ORDER = [
    "init",
    "loading",
    "extracting",
    "screenshots",
    "assets",
    "vision",
    "memory",
    "done",
]

// ════════════════════════════════════════════════════
// PROGRESS VIEW
// ════════════════════════════════════════════════════

interface ProgressViewProps {
    jobId: string
    onViewExplorer: (data: any) => void
    onBack: () => void
}

export function ProgressView({ jobId, onViewExplorer, onBack }: ProgressViewProps) {
    const [events, setEvents] = useState<ProgressEvent[]>([])
    const [currentPhase, setCurrentPhase] = useState<string>("init")
    const [progress, setProgress] = useState(0)
    const [isDone, setIsDone] = useState(false)
    const [hasError, setHasError] = useState(false)

    const [resultData, setResultData] = useState<any>(null)
    const eventSourceRef = useRef<EventSource | null>(null)
    const logEndRef = useRef<HTMLDivElement>(null)

    // Auto-scroll log
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [events])

    // Connect SSE
    useEffect(() => {
        const connect = () => {
            const es = new EventSource(`/api/extract/${jobId}/progress`)
            eventSourceRef.current = es

            es.onmessage = (msg) => {
                try {
                    const event: ProgressEvent = JSON.parse(msg.data)

                    // Handle reconnect signal from the server (55-min timeout bypass)
                    if (event.phase === "reconnect") {
                        es.close()
                        setTimeout(connect, 500)
                        return
                    }

                    setEvents((prev) => [...prev, event])
                    setCurrentPhase(event.phase)

                    if (event.progress !== undefined) {
                        setProgress(event.progress)
                    }

                    if (event.phase === "done") {
                        setIsDone(true)
                        es.close()
                        localStorage.removeItem("uih_jobId")
                        // Fetch final result for explorer
                        fetch(`/api/extract/${jobId}/result`)
                            .then((r) => r.json())
                            .then(setResultData)
                            .catch(() => { })
                    }

                    if (event.phase === "error") {
                        setHasError(true)
                        es.close()
                        localStorage.removeItem("uih_jobId")
                    }
                } catch { }
            }

            es.onerror = () => {
                // Auto-reconnect after a brief delay.
                // GCR might have dropped the SSE connection — the job still runs.
                es.close()
                setTimeout(() => {
                    // Check if job is still alive before reconnecting
                    fetch(`/api/extract/${jobId}/status`)
                        .then((r) => r.json())
                        .then((data) => {
                            if (data.status === "done") {
                                setIsDone(true)
                                localStorage.removeItem("uih_jobId")
                                fetch(`/api/extract/${jobId}/result`)
                                    .then((r) => r.json())
                                    .then(setResultData)
                                    .catch(() => { })
                            } else if (data.status === "error") {
                                setHasError(true)
                                localStorage.removeItem("uih_jobId")
                            } else if (data.status === "running") {
                                connect()
                            }
                        })
                        .catch(() => {
                            // Server unreachable — try again in 5s
                            setTimeout(connect, 5000)
                        })
                }, 2000)
            }
        }

        connect()

        return () => {
            eventSourceRef.current?.close()
        }
    }, [jobId])

    const handleDownload = () => {
        window.open(`/api/extract/${jobId}/download`, "_blank")
    }

    const handleViewExplorer = () => {
        if (resultData) {
            onViewExplorer(resultData)
        }
    }

    const handleBack = () => {
        localStorage.removeItem("uih_jobId")
        onBack()
    }

    const phaseIndex = PHASE_ORDER.indexOf(currentPhase)

    return (
        <div className="flex h-dvh w-full items-center justify-center bg-background relative overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full opacity-[0.05]"
                    style={{
                        background: "radial-gradient(circle, var(--color-primary), transparent 70%)",
                    }}
                />
            </div>

            <div className="relative z-10 w-full max-w-xl px-6">
                {/* Header */}
                <div className="text-center mb-8">
                    <h2 className="text-xl font-bold text-foreground tracking-tight">
                        {isDone ? "Extraction Complete!" : hasError ? "Extraction Failed" : "Extracting Design System…"}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1.5 font-mono">Job: {jobId}</p>
                    {events.length > 0 && (() => {
                        const lastEvent = events[events.length - 1]
                        if (lastEvent.pageCount && lastEvent.pageCount > 1) {
                            return (
                                <p className="text-[11px] text-chart-3 font-semibold mt-1">
                                    Page {(lastEvent.pageIndex ?? 0) + 1} of {lastEvent.pageCount}
                                </p>
                            )
                        }
                        return null
                    })()}
                </div>

                {/* Progress bar */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                            {PHASE_LABELS[currentPhase] || currentPhase}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">{progress}%</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{
                                width: `${progress}%`,
                                background: hasError
                                    ? "var(--color-destructive)"
                                    : isDone
                                        ? "var(--color-chart-3)"
                                        : "var(--color-primary)",
                            }}
                        />
                    </div>
                </div>

                {/* Phase Steps */}
                <div className="flex items-center gap-1 mb-6 px-2">
                    {PHASE_ORDER.slice(0, -1).map((phase, i) => {
                        const isActive = phase === currentPhase
                        const isCompleted = phaseIndex > i
                        return (
                            <div key={phase} className="flex-1 flex flex-col items-center gap-1.5">
                                <div
                                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${isCompleted
                                        ? "bg-primary scale-100"
                                        : isActive
                                            ? "bg-primary animate-pulse scale-125"
                                            : "bg-muted-foreground/20"
                                        }`}
                                />
                                <span
                                    className={`text-[9px] font-medium transition-colors ${isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground/40"
                                        }`}
                                >
                                    {PHASE_LABELS[phase]?.split(" ")[0]}
                                </span>
                            </div>
                        )
                    })}
                </div>

                {/* Log */}
                <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
                        <div className="flex gap-1">
                            <div className="w-2 h-2 rounded-full bg-destructive/50" />
                            <div className="w-2 h-2 rounded-full bg-chart-4/50" />
                            <div className="w-2 h-2 rounded-full bg-chart-3/50" />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">extraction log</span>
                    </div>
                    <div className="h-48 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
                        {events.map((event, i) => (
                            <div
                                key={i}
                                className={`flex items-start gap-2 py-0.5 ${event.phase === "error" ? "text-destructive" : "text-muted-foreground"
                                    }`}
                            >
                                <span className="text-primary/50 select-none shrink-0">›</span>
                                <span>{event.message}</span>
                            </div>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    {isDone && (
                        <>
                            <button
                                onClick={handleDownload}
                                className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-sm font-semibold
                           flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98]
                           shadow-lg shadow-primary/20"
                            >
                                <Download className="w-4 h-4" />
                                Download ZIP
                            </button>
                            {resultData && (
                                <button
                                    onClick={handleViewExplorer}
                                    className="flex-1 h-12 bg-card border border-border text-foreground rounded-xl text-sm font-semibold
                             flex items-center justify-center gap-2 hover:bg-muted/50 transition-all active:scale-[0.98]"
                                >
                                    <Eye className="w-4 h-4" />
                                    View Explorer
                                </button>
                            )}
                        </>
                    )}

                    {hasError && (
                        <button
                            onClick={handleBack}
                            className="flex-1 h-12 bg-card border border-border text-foreground rounded-xl text-sm font-semibold
                         flex items-center justify-center gap-2 hover:bg-muted/50 transition-all active:scale-[0.98]"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Try Again
                        </button>
                    )}

                    {!isDone && !hasError && (
                        <div className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>You can safely close this tab — extraction continues on the server</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
