// ** import core packages
import { useState, useMemo } from "react"
import {
    ArrowLeft,
    Zap,
    Loader2,
    Check,
    Globe,
    FileText,
    ChevronDown,
    ChevronUp,
} from "lucide-react"

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

export interface PageInfo {
    url: string
    title: string
    path: string
}

// ════════════════════════════════════════════════════
// PAGE SELECTOR VIEW
//
// Shows discovered pages with checkboxes.
// User can select/deselect pages before extraction.
// ════════════════════════════════════════════════════

interface PageSelectorViewProps {
    url: string
    pages: PageInfo[]
    runMemory: boolean
    onStartExtraction: (selectedPages: string[]) => void
    onBack: () => void
}

export function PageSelectorView({
    url,
    pages,
    runMemory,
    onStartExtraction,
    onBack,
}: PageSelectorViewProps) {
    const [selectedUrls, setSelectedUrls] = useState<Set<string>>(
        () => new Set(pages.map((p) => p.url))
    )
    const [loading, setLoading] = useState(false)
    const [expanded, setExpanded] = useState(true)

    const hostname = useMemo(() => {
        try {
            return new URL(url).hostname
        } catch {
            return url
        }
    }, [url])

    const allSelected = selectedUrls.size === pages.length
    const noneSelected = selectedUrls.size === 0

    const toggleAll = () => {
        if (allSelected) {
            setSelectedUrls(new Set())
        } else {
            setSelectedUrls(new Set(pages.map((p) => p.url)))
        }
    }

    const togglePage = (pageUrl: string) => {
        setSelectedUrls((prev) => {
            const next = new Set(prev)
            if (next.has(pageUrl)) {
                next.delete(pageUrl)
            } else {
                next.add(pageUrl)
            }
            return next
        })
    }

    const handleStartExtraction = async () => {
        if (noneSelected) return
        setLoading(true)

        try {
            const selectedPages = pages
                .filter((p) => selectedUrls.has(p.url))
                .map((p) => p.url)

            const res = await fetch("/api/extract", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url,
                    runMemory,
                    pages: selectedPages,
                }),
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: "Server error" }))
                throw new Error(data.error || "Failed to start extraction")
            }

            const { jobId } = await res.json()
            localStorage.setItem("uih_jobId", jobId)
            onStartExtraction(pages.filter((p) => selectedUrls.has(p.url)).map((p) => p.url))

            // The parent will handle the transition via jobId stored in localStorage
            // We need to call onStartExtraction which triggers the parent
        } catch (err) {
            console.error("Failed to start extraction:", err)
        } finally {
            setLoading(false)
        }
    }

    // Group pages by depth
    const groupedPages = useMemo(() => {
        const groups: { label: string; pages: PageInfo[] }[] = []
        const root: PageInfo[] = []
        const nested: PageInfo[] = []

        for (const page of pages) {
            const segments = page.path.split("/").filter(Boolean)
            if (segments.length <= 1) {
                root.push(page)
            } else {
                nested.push(page)
            }
        }

        if (root.length > 0) groups.push({ label: "Main Pages", pages: root })
        if (nested.length > 0) groups.push({ label: "Subpages", pages: nested })

        return groups
    }, [pages])

    return (
        <div className="flex h-dvh w-full items-center justify-center bg-background relative overflow-hidden">
            {/* Atmospheric background */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute -top-24 -right-24 w-[600px] h-[600px] rounded-full opacity-[0.05]"
                    style={{
                        background: "radial-gradient(circle, var(--color-chart-3), transparent 65%)",
                    }}
                />
                <div
                    className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full opacity-[0.04]"
                    style={{
                        background: "radial-gradient(circle, var(--color-primary), transparent 65%)",
                    }}
                />
                <div
                    className="absolute inset-0 opacity-[0.012]"
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
                {/* Header */}
                <div className="mb-6">
                    <button
                        onClick={onBack}
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back
                    </button>

                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-chart-3/15 border border-chart-3/20 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4 text-chart-3" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-bold text-foreground tracking-tight truncate">
                                Select Pages
                            </h2>
                            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                                <Globe className="w-3 h-3 shrink-0" />
                                {hostname}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Select All / Count */}
                <div className="flex items-center justify-between mb-3 px-1">
                    <label
                        className="flex items-center gap-2 cursor-pointer group"
                        onClick={toggleAll}
                    >
                        <div
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-all
                ${allSelected
                                    ? "bg-primary border-primary"
                                    : noneSelected
                                        ? "border-border bg-card"
                                        : "bg-primary/30 border-primary/50"
                                }`}
                        >
                            {(allSelected || (!allSelected && !noneSelected)) && (
                                <Check className="w-3 h-3 text-primary-foreground" />
                            )}
                        </div>
                        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                            {allSelected ? "Deselect all" : "Select all"}
                        </span>
                    </label>
                    <span className="text-[11px] font-mono text-muted-foreground">
                        {selectedUrls.size} of {pages.length} pages
                    </span>
                </div>

                {/* Pages List */}
                <div className="bg-card border border-border rounded-xl overflow-hidden mb-5">
                    {groupedPages.map((group, gi) => (
                        <div key={gi}>
                            {groupedPages.length > 1 && (
                                <button
                                    onClick={() => setExpanded((e) => !e)}
                                    className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:bg-muted/50 transition-colors"
                                >
                                    {group.label} ({group.pages.length})
                                    {gi === 1 && (expanded ? (
                                        <ChevronUp className="w-3 h-3" />
                                    ) : (
                                        <ChevronDown className="w-3 h-3" />
                                    ))}
                                </button>
                            )}
                            {(gi === 0 || expanded) && (
                                <div className="max-h-[280px] overflow-y-auto">
                                    {group.pages.map((page, i) => {
                                        const isSelected = selectedUrls.has(page.url)
                                        return (
                                            <label
                                                key={page.url}
                                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors
                                  ${isSelected ? "bg-primary/[0.04]" : "hover:bg-muted/30"}
                                  ${i < group.pages.length - 1 ? "border-b border-border/50" : ""}`}
                                                onClick={() => togglePage(page.url)}
                                            >
                                                <div
                                                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0
                                    ${isSelected ? "bg-primary border-primary" : "border-border bg-card"}`}
                                                >
                                                    {isSelected && (
                                                        <Check className="w-3 h-3 text-primary-foreground" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-foreground truncate leading-tight">
                                                        {page.title || page.path}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground/60 truncate leading-tight mt-0.5 font-mono">
                                                        {page.path}
                                                    </p>
                                                </div>
                                            </label>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Start Button */}
                <button
                    onClick={handleStartExtraction}
                    disabled={loading || noneSelected}
                    className="w-full h-14 bg-primary text-primary-foreground rounded-2xl text-sm font-bold
                     flex items-center justify-center gap-2.5
                     hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 active:scale-[0.98]
                     shadow-lg shadow-primary/20"
                >
                    {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            <Zap className="w-4.5 h-4.5" />
                            Extract {selectedUrls.size} {selectedUrls.size === 1 ? "Page" : "Pages"}
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}
