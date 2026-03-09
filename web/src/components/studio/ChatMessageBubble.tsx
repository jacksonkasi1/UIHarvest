import { useState } from "react"
import { Check, FileCode2, Copy, RefreshCcw } from "lucide-react"
import type { ChatMessage } from "@/types/studio"
import { MarkdownContent } from "./MarkdownContent"
import { ToolExecutionCard } from "./ToolExecutionCard"
import { relativeTime } from "./ThinkingIndicator"

export function ChatMessageBubble({ msg, msgIdx, onRetry }: { msg: ChatMessage, msgIdx: number, onRetry?: () => void }) {
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        if (!msg.content) return
        navigator.clipboard.writeText(msg.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div
            className={`group flex flex-col gap-1 w-full relative z-0 ${msg.role === "user" ? "items-end" : "items-start"}`}
            style={{ animationDelay: `${msgIdx * 30}ms` }}
        >
            <div className={`w-fit max-w-[92%] px-1 ${msg.role === "user"
                ? "bg-muted/70 px-4 py-3 rounded-[1.25rem] rounded-tr-sm text-foreground text-[14px]"
                : "text-foreground"
                }`}>
                {/* User images */}
                {msg.images && msg.images.length > 0 && (
                    <div className="flex gap-2 mb-3 flex-wrap">
                        {msg.images.map((img, i) => (
                            <img
                                key={i}
                                src={img.preview}
                                alt={img.name}
                                width={64}
                                height={64}
                                className="h-16 w-16 rounded-xl object-cover border border-border/80 shadow-sm"
                            />
                        ))}
                    </div>
                )}
                {/* Tool cards */}
                {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                    <div className="mb-4 space-y-2 mt-2 w-full">
                        <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground mb-1.5 px-1">
                            <FileCode2 aria-hidden="true" className="w-3.5 h-3.5" />
                            <span>{msg.toolExecutions.length} edit{msg.toolExecutions.length !== 1 ? 's' : ''} applied</span>
                        </div>
                        <div className="flex flex-col w-full max-w-full overflow-hidden">
                            {msg.toolExecutions.map((exec, i) => (
                                <ToolExecutionCard key={i} exec={exec} />
                            ))}
                        </div>
                    </div>
                )}
                {/* Message content */}
                {msg.role === "assistant" && msg.content && (!msg.toolExecutions || msg.toolExecutions.length === 0) ? (
                    <MarkdownContent content={msg.content} />
                ) : msg.content && (!msg.toolExecutions || msg.toolExecutions.length === 0) ? (
                    <span className="text-[14px] leading-relaxed block whitespace-pre-wrap text-foreground">{msg.content}</span>
                ) : null}
                {msg.status === "streaming" && (
                    <span className="inline-block w-1.5 h-3.5 bg-muted-foreground animate-pulse ml-1 align-middle motion-reduce:animate-none" />
                )}
            </div>
            {/* Timestamp and Actions */}
            <div className={`flex items-center gap-2 px-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <span className="text-[10px] text-muted-foreground font-medium tracking-wide shrink-0">
                    {msg.status === "done" && msg.role !== 'assistant' && <Check aria-hidden="true" className="inline h-3 w-3 mr-0.5 text-muted" />}
                    {relativeTime(msg.timestamp)}
                </span>
                
                {msg.status === "done" && msg.content && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={handleCopy} 
                            className="p-1 text-muted-foreground/70 hover:text-foreground hover:bg-muted rounded-md transition-colors"
                            aria-label="Copy message"
                            title="Copy message"
                        >
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        {onRetry && msg.role === "assistant" && (
                            <button 
                                onClick={onRetry} 
                                className="p-1 text-muted-foreground/70 hover:text-foreground hover:bg-muted rounded-md transition-colors"
                                aria-label="Retry message"
                                title="Retry message"
                            >
                                <RefreshCcw className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
