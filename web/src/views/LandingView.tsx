// ** import core packages
import { useState } from "react"
import { Globe, Zap, Download, Loader2, Sparkles } from "lucide-react"

// ** import types
import type { PageInfo } from "./PageSelectorView"


// ════════════════════════════════════════════════════
// LANDING VIEW
//
// Home page: URL input → discover pages → navigate to page selector.
// ════════════════════════════════════════════════════

interface LandingViewProps {
    onPagesDiscovered: (url: string, pages: PageInfo[], runMemory: boolean) => void
    existingJobId: string | null
    onResumeJob: (jobId: string) => void
}

export function LandingView({ onPagesDiscovered, existingJobId, onResumeJob }: LandingViewProps) {
    const [url, setUrl] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const [runMemory, setRunMemory] = useState(false)

    const isValidUrl = (input: string): boolean => {
        try {
            const parsed = new URL(input)
            return parsed.protocol === "http:" || parsed.protocol === "https:"
        } catch {
            return false
        }
    }

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
            onPagesDiscovered(fullUrl, pages, runMemory)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex h-dvh w-full items-center justify-center bg-background relative overflow-hidden">
            {/* Atmospheric background gradients */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute -top-24 -left-24 w-[700px] h-[700px] rounded-full opacity-[0.06]"
                    style={{
                        background: "radial-gradient(circle, var(--color-primary), transparent 65%)",
                    }}
                />
                <div
                    className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full opacity-[0.04]"
                    style={{
                        background: "radial-gradient(circle, var(--color-chart-3), transparent 65%)",
                    }}
                />
                {/* Grid pattern */}
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

            <div className="relative z-10 w-full max-w-lg px-6">
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

                    {/* Options */}
                    <label className="flex items-center gap-2.5 px-1 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={runMemory}
                            onChange={(e) => setRunMemory(e.target.checked)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary/40 bg-card cursor-pointer"
                        />
                        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                            Generate AI design memory (requires Gemini API key)
                        </span>
                    </label>

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
