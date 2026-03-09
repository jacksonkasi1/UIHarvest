import { useState } from "react"
import { Loader2, CheckCircle, AlertCircle, FileCode, ChevronDown, ChevronRight } from "lucide-react"
import type { ToolExecution } from "@/types/studio"

export function ToolExecutionCard({ exec }: { exec: ToolExecution }) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className="my-1 border border-border/60 rounded-xl bg-background overflow-hidden transition-all duration-200 hover:border-border/80 shadow-sm">
            <button
                className="flex items-center gap-3 w-full px-3 py-3 text-left text-[14px] transition-colors focus:outline-none bg-background hover:bg-muted/30"
                onClick={() => setExpanded(!expanded)}
                disabled={!exec.summary && exec.status === "running"}
            >
                {exec.status === "running" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#f97316] shrink-0" />
                ) : exec.status === "complete" ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
                <FileCode className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                <span className="flex-1 text-foreground font-medium truncate tracking-tight text-[14px]">
                    {exec.message}
                </span>
                {exec.filesChanged !== undefined && (
                    <span className="text-[12px] text-muted-foreground font-mono shrink-0 px-2 py-0.5 bg-muted rounded-md mr-1">
                        {exec.filesChanged} file{exec.filesChanged !== 1 ? "s" : ""}
                    </span>
                )}
                {expanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 opacity-50" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-50" />
                )}
            </button>
            {expanded && exec.summary && (
                <div className="px-4 pb-4 pt-1 text-[13px] text-muted-foreground bg-background border-t border-border/50 mt-0">
                    <p className="leading-relaxed mt-2">{exec.summary}</p>
                </div>
            )}
        </div>
    )
}
