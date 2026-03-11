// ** import core packages
import { useEffect, useRef, useState } from "react"
import {
    Loader2,
    Download,
    Eye,
    ArrowLeft,
    Palette,
    Type,
    Box,
    Image,
    Layers,
    Sparkles,
    AlertCircle,
    RotateCcw,
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
// LOADING OVERLAY — shown when user clicks "View Explorer"
// ════════════════════════════════════════════════════

const ASSET_STEPS = [
    { icon: Palette, label: "Loading colors & gradients…" },
    { icon: Type, label: "Loading typography…" },
    { icon: Box, label: "Loading components…" },
    { icon: Image, label: "Loading images & SVGs…" },
    { icon: Layers, label: "Loading design memory…" },
    { icon: Sparkles, label: "Preparing explorer…" },
]

interface LoadingOverlayProps {
    error: string | null
    onRetry: () => void
    onBack: () => void
}

function LoadingOverlay({ error, onRetry, onBack }: LoadingOverlayProps) {
    const [step, setStep] = useState(0)
    const [pct, setPct] = useState(0)

    // Animate through steps while loading
    useEffect(() => {
        if (error) return
        const tick = setInterval(() => {
            setStep((s) => {
                const next = s + 1
                if (next >= ASSET_STEPS.length) { clearInterval(tick); return s }
                return next
            })
            setPct((p) => Math.min(p + Math.floor(100 / ASSET_STEPS.length), 95))
        }, 420)
        return () => clearInterval(tick)
    }, [error])

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
            {/* background glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.06]"
                    style={{ background: "radial-gradient(circle, var(--color-primary), transparent 65%)" }}
                />
            </div>

            <div className="relative z-10 w-full max-w-sm px-6 flex flex-col items-center gap-8">
                {error ? (
                    /* ── Error state ── */
                    <div className="w-full text-center space-y-5">
                        <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
                            <AlertCircle className="w-7 h-7 text-destructive" />
                        </div>
                        <div>
                            <p className="text-base font-semibold text-foreground mb-1">Couldn't load result</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={onRetry}
                                className="w-full h-11 bg-primary text-primary-foreground rounded-xl text-sm font-semibold
                                           flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Retry
                            </button>
                            <button
                                onClick={onBack}
                                className="w-full h-11 bg-card border border-border text-foreground rounded-xl text-sm font-semibold
                                           flex items-center justify-center gap-2 hover:bg-muted/50 transition-all"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ── Loading state ── */
                    <>
                        {/* Icon pulse */}
                        <div className="relative">
                            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                            </div>
                            {/* Orbiting dot */}
                            <div
                                className="absolute inset-0 rounded-full"
                                style={{ animation: "spin 2s linear infinite" }}
                            >
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-primary" />
                            </div>
                        </div>

                        <div className="w-full text-center space-y-1">
                            <p className="text-base font-semibold text-foreground">Loading Design System</p>
                            <p className="text-xs text-muted-foreground h-4 transition-all duration-300">
                                {ASSET_STEPS[step]?.label ?? "Almost there…"}
                            </p>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full space-y-2">
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500 ease-out bg-primary"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground/60 font-mono">
                                <span>{pct}%</span>
                                <span>fetching assets</span>
                            </div>
                        </div>

                        {/* Step pills */}
                        <div className="flex flex-wrap gap-1.5 justify-center">
                            {ASSET_STEPS.map(({ icon: Icon, label }, i) => (
                                <div
                                    key={label}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all duration-300 ${i < step
                                        ? "bg-primary/10 text-primary"
                                        : i === step
                                            ? "bg-primary/20 text-primary ring-1 ring-primary/30 scale-105"
                                            : "bg-muted/40 text-muted-foreground/40"
                                        }`}
                                >
                                    <Icon className="w-2.5 h-2.5" />
                                    {label.split("…")[0].replace("Loading ", "")}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

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
    const [downloading, setDownloading] = useState(false)

    // Explorer loading overlay state
    const [explorerLoading, setExplorerLoading] = useState(false)
    const [explorerError, setExplorerError] = useState<string | null>(null)

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
                        setProgress(100)
                        es.close()
                        localStorage.removeItem("uih_jobId")
                    }

                    if (event.phase === "error") {
                        setHasError(true)
                        es.close()
                        localStorage.removeItem("uih_jobId")
                    }
                } catch { }
            }

            es.onerror = () => {
                es.close()
                setTimeout(() => {
                    fetch(`/api/extract/${jobId}/status`, { credentials: "include" })
                        .then((r) => r.json())
                        .then((data) => {
                            if (data.status === "done") {
                                setIsDone(true)
                                setProgress(100)
                                localStorage.removeItem("uih_jobId")
                            } else if (data.status === "error") {
                                setHasError(true)
                                localStorage.removeItem("uih_jobId")
                            } else {
                                connect()
                            }
                        })
                        .catch(() => setTimeout(connect, 5000))
                }, 2000)
            }
        }

        connect()

        return () => {
            eventSourceRef.current?.close()
        }
    }, [jobId])

    // ── Called when user clicks "View Explorer" ──────────────────────────
    const handleViewExplorer = () => {
        setExplorerLoading(true)
        setExplorerError(null)
        loadResult(0)
    }

    const loadResult = (attempt: number) => {
        fetch(`/api/extract/${jobId}/result`, { credentials: "include" })
            .then((r) => {
                if (!r.ok) throw new Error(`Server returned ${r.status}`)
                return r.json()
            })
            .then((data) => {
                // Success — hand off to explorer immediately (overlay disappears)
                onViewExplorer(data)
            })
            .catch((err) => {
                if (attempt < 6) {
                    // Retry with backoff: 1s, 2s, 4s, 8s, 16s, 30s
                    const delay = Math.min(1000 * 2 ** attempt, 30_000)
                    setTimeout(() => loadResult(attempt + 1), delay)
                } else {
                    // All retries exhausted — show error inside the overlay
                    setExplorerError(
                        (err as Error).message.includes("404") || (err as Error).message.includes("500")
                            ? "This extraction's result file was not found. It may have been created before GCS storage was enabled, or the file was deleted."
                            : `Could not load result: ${(err as Error).message}`
                    )
                }
            })
    }

    const handleDownload = () => {
        setDownloading(true)
        fetch(`/api/extract/${jobId}/download`, { credentials: "include" })
            .then(async (res) => {
                if (!res.ok) {
                    const payload = await res.json().catch(() => ({}))
                    throw new Error(payload.error || "Download failed")
                }
                return res.blob()
            })
            .then((blob) => {
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = url
                a.download = `uiharvest-${jobId}.tar.gz`
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
            })
            .catch((err) => {
                setEvents((prev) => [
                    ...prev,
                    { phase: "error", message: `Download failed: ${(err as Error).message}` },
                ])
            })
            .finally(() => setDownloading(false))
    }

    const handleBack = () => {
        localStorage.removeItem("uih_jobId")
        onBack()
    }

    const phaseIndex = PHASE_ORDER.indexOf(currentPhase)

    return (
        <>
            {/* ── Explorer loading overlay ── */}
            {explorerLoading && (
                <LoadingOverlay
                    error={explorerError}
                    onRetry={() => { setExplorerError(null); loadResult(0) }}
                    onBack={() => { setExplorerLoading(false); setExplorerError(null) }}
                />
            )}

            <div className="flex h-dvh w-full items-center justify-center bg-background relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div
                        className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full opacity-[0.05]"
                        style={{ background: "radial-gradient(circle, var(--color-primary), transparent 70%)" }}
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
                            const isCompleted = isDone || phaseIndex > i
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
                                {/* View Explorer — always clickable; loads on demand */}
                                <button
                                    onClick={handleViewExplorer}
                                    className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-sm font-semibold
                                               flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98]
                                               shadow-lg shadow-primary/20"
                                >
                                    <Eye className="w-4 h-4" />
                                    View Explorer
                                </button>

                                {/* Download ZIP */}
                                <button
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    className="flex-1 h-12 bg-card border border-border text-foreground rounded-xl text-sm font-semibold
                                               flex items-center justify-center gap-2 hover:bg-muted/50 transition-all active:scale-[0.98]
                                               disabled:opacity-60 disabled:cursor-wait"
                                >
                                    {downloading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Downloading…
                                        </>
                                    ) : (
                                        <>
                                            <Download className="w-4 h-4" />
                                            Download ZIP
                                        </>
                                    )}
                                </button>
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
        </>
    )
}
