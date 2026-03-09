import { Lightbulb } from "lucide-react"

export function ThinkingIndicator() {
    return (
        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300 px-1 py-2">
            <div className="flex shrink-0 items-center justify-center">
                <Lightbulb className="h-[15px] w-[15px] text-muted-foreground" />
            </div>
            <span className="text-[13px] text-muted-foreground font-medium">Thought for a moment</span>
        </div>
    )
}

export function relativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return "just now"
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
}
