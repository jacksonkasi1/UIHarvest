import { Sparkles } from "lucide-react"

export function ThinkingIndicator() {
    return (
        <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 px-2 py-3">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                <Sparkles className="h-4 w-4 text-gray-400" />
            </div>
            <div className="flex items-center gap-2">
                <span className="text-[13px] text-gray-500 font-medium">Thinking</span>
            </div>
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
