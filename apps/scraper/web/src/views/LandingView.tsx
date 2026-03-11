// ** import core packages
import { useState, useEffect, useCallback } from "react"
import { Globe, Zap, Download, Loader2, Sparkles, Clock, Trash2, ExternalLink, CheckCircle2, XCircle } from "lucide-react"

// ** import types
import type { PageInfo } from "./PageSelectorView"


// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

interface PastJob {
    id: string
    url: string
    status: "running" | "done" | "error"
    createdAt: number
    completedAt: number | null
}

// ════════════════════════════════════════════════════
// LANDING VIEW
//
// Home page: URL input → discover pages → navigate to page selector.
// Also shows past completed jobs from Firestore.
// ════════════════════════════════════════════════════

interface LandingViewProps {
    onPagesDiscovered: (url: string, pages: PageInfo[], runMemory: boolean) => void
    existingJobId: string | null
    onResumeJob: (jobId: string) => void
    onOpenJob: (jobId: string) => void
}

export function LandingView({ onPagesDiscovered, existingJobId, onResumeJob, onOpenJob }: LandingViewProps) {
    const [url, setUrl] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

    const [pastJobs, setPastJobs] = useState<PastJob[]>([])
    const [jobsLoading, setJobsLoading] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const isValidUrl = (input: string): boolean => {
        try {
            const parsed = new URL(input)
            return parsed.protocol === "http:" || parsed.protocol === "https:"
        } catch {
            return false
        }
    }

    // Load past jobs from Firestore via /api/jobs
    const loadJobs = useCallback(() => {
        fetch("/api/jobs")
            .then((res) => (res.ok ? res.json() : { jobs: [] }))
            .then(({ jobs }) => setPastJobs(jobs as PastJob[]))
            .catch(() => setPastJobs([]))
            .finally(() => setJobsLoading(false))
    }, [])

    useEffect(() => {
        loadJobs()
    }, [loadJobs])

    // Refresh jobs list when the tab regains focus
    useEffect(() => {
        const handleFocus = () => loadJobs()
        window.addEventListener("focus", handleFocus)
        return () => window.removeEventListener("focus", handleFocus)
    }, [loadJobs])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        const cleanUrl = url.trim()
        if (!cleanUrl) {
            setError("Please enter a URL")
            return
        }

        const fullUrl = cleanUrl.startsWith("http") ? cleanUrl : `https://${cleanUrl}`

        if (!isValidUrl(fullUrl)) {
            setError("Please enter a valid URL (e.g. https://stripe.com)")
            return
        }

        setLoading(true)

        try {
            const res = await fetch("/api/extract/discover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: fullUrl }),
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: "Server error" }))
                throw new Error(data.error || "Failed to discover pages")
            }

            const { pages } = await res.json()
            onPagesDiscovered(fullUrl, pages, true)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (jobId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setDeletingId(jobId)
        try {
            await fetch(`/api/extract/${jobId}`, { method: "DELETE" })
            setPastJobs((prev) => prev.filter((j) => j.id !== jobId))
        } catch {
            // ignore
        } finally {
            setDeletingId(null)
        }
    }

    const formatAge = (ts: number): string => {
        const diff = Date.now() - ts
        const mins = Math.floor(diff / 60_000)
        const hours = Math.floor(diff / 3_600_000)
        const days = Math.floor(diff / 86_400_000)
        if (days > 0) return `${days}d ago`
        if (hours > 0) return `${hours}h ago`
        if (mins > 0) return `${mins}m ago`
        return "just now"
    }

    const formatHostname = (rawUrl: string): string => {
        try { return new URL(rawUrl).hostname } catch { return rawUrl }
    }

    return (
        <div className="flex h-dvh w-full items-center justify-center bg-background relative overflow-hidden">
            {/* Atmospheric background gradients */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute -top-24 -left-24 w-[700px] h-[700px] rounded-full opacity-[0.06]"
                    style={{ background: "radial-gradient(circle, var(--color-primary), transparent 65%)" }}
                />
                <div
                    className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full opacity-[0.04]"
                    style={{ background: "radial-gradient(circle, var(--color-chart-3), transparent 65%)" }}
                />
                <div
                    className="absolute inset-0 opacity-[0.015]"
                    style={{
                        backgroundImage: `
              linear-gradient(var(--color-foreground) 1px, transparent 1px),
              linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)
            `,
                        backgroundSize: "60px 60px",
                    }}
                />
            </div>

            <div className="relative z-10 w-full max-w-lg px-6 flex flex-col max-h-dvh overflow-y-auto py-10">
                {/* Logo / Brand */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2.5 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-primary" />
                        </div>
                        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">UIHarvest</h1>
                    </div>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                        Extract complete design systems from any live website — colors, typography, components, and more.
                    </p>
                </div>

                {/* Resume banner */}
                {existingJobId && (
                    <button
                        onClick={() => onResumeJob(existingJobId)}
                        className="w-full mb-6 p-3.5 rounded-xl bg-primary/10 border border-primary/20
                       text-sm text-primary hover:bg-primary/15 transition-colors
                       flex items-center justify-center gap-2 font-medium"
                    >
                        <Loader2 className="w-4 h-4 animate-spin" />
                        You have an extraction in progress. Click to resume.
                    </button>
                )}

                {/* URL Input */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/50 pointer-events-none" />
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => {
                                setUrl(e.target.value)
                                if (error) setError("")
                            }}
                            placeholder="https://stripe.com"
                            autoFocus
                            className="w-full h-14 pl-11 pr-4 text-sm bg-card border border-border rounded-2xl
                         text-foreground placeholder:text-muted-foreground/40
                         focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50
                         transition-all duration-200"
                        />
                    </div>

                    {error && (
                        <p className="text-xs text-destructive text-center animate-in fade-in slide-in-from-top-1 duration-200">
                            {error}
                        </p>
                    )}

                    <p className="text-xs text-muted-foreground px-1">
                        Design memory generation is enabled automatically for every extraction.
                    </p>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-14 bg-primary text-primary-foreground rounded-2xl text-sm font-bold
                       flex items-center justify-center gap-2.5
                       hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 active:scale-[0.98]
                       shadow-lg shadow-primary/20"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Discovering pages…</span>
                            </>
                        ) : (
                            <>
                                <Zap className="w-4.5 h-4.5" />
                                Extract Design System
                            </>
                        )}
                    </button>
                </form>

                {/* Past extractions */}
                {(jobsLoading || pastJobs.length > 0) && (
                    <div className="mt-10">
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5" />
                            Past Extractions
                        </h2>

                        {jobsLoading ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {pastJobs.map((job) => (
                                    <div
                                        key={job.id}
                                        onClick={() => onOpenJob(job.id)}
                                        className="group flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border
                                               hover:border-primary/30 hover:bg-primary/5 cursor-pointer transition-all duration-150"
                                    >
                                        <div className="shrink-0">
                                            {job.status === "done"
                                                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                : job.status === "running"
                                                    ? <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                                    : <XCircle className="w-4 h-4 text-destructive" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">
                                                {formatHostname(job.url)}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                                {job.completedAt ? formatAge(job.completedAt) : formatAge(job.createdAt)}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <span className="text-[10px] text-muted-foreground font-mono opacity-50">
                                                {job.id}
                                            </span>
                                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors ml-1" />
                                            <button
                                                onClick={(e) => handleDelete(job.id, e)}
                                                disabled={deletingId === job.id}
                                                className="ml-1 p-1 rounded-md hover:bg-destructive/10 hover:text-destructive
                                                       text-muted-foreground/40 transition-colors disabled:opacity-50"
                                                title="Delete extraction"
                                            >
                                                {deletingId === job.id
                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    : <Trash2 className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Features */}
                <div className="mt-12 grid grid-cols-3 gap-4 text-center">
                    {[
                        { icon: Globe, label: "Live Extraction", desc: "From any URL" },
                        { icon: Zap, label: "AI-Powered", desc: "Gemini Vision" },
                        { icon: Download, label: "Download", desc: "ZIP export" },
                    ].map(({ icon: Icon, label, desc }) => (
                        <div key={label} className="flex flex-col items-center gap-1.5">
                            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center">
                                <Icon className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <p className="text-[11px] font-semibold text-foreground">{label}</p>
                            <p className="text-[10px] text-muted-foreground">{desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
