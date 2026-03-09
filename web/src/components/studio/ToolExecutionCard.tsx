import { useState } from "react"
import { Loader2, CheckCircle, AlertCircle, FileCode2, ChevronDown, ChevronRight } from "lucide-react"
import type { ToolExecution } from "@/types/studio"

export function ToolExecutionCard({ exec }: { exec: ToolExecution }) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className="my-1 border border-border/60 rounded-xl bg-background/50 overflow-hidden transition-all duration-200 hover:border-border/80 shadow-sm">
            <button
                className="flex items-center gap-2.5 w-full px-3 py-3 text-left text-[13px] transition-colors focus:outline-none bg-background"
                onClick={() => setExpanded(!expanded)}
            >
                {exec.status === "running" ? (
                    <div className="relative shrink-0">
                        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                        <Loader2 className="h-4 w-4 animate-spin text-primary relative" />
                    </div>
                ) : exec.status === "complete" ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
                <FileCode2 className="h-4 w-4 text-muted-foreground/60 shrink-0 ml-1" />
                <span className="flex-1 text-foreground font-medium truncate tracking-tight text-[13px]">
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
                <div className="px-4 pb-3 pt-2 text-[13px] text-muted-foreground bg-muted/20 border-t border-border/50 mt-0">
                    <p className="leading-relaxed">{exec.summary}</p>
                </div>
            )}
        </div>
    )
}
