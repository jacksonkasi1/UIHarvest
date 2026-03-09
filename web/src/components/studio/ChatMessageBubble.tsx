import { Check, FileCode2 } from "lucide-react"
import type { ChatMessage } from "@/types/studio"
import { MarkdownContent } from "./MarkdownContent"
import { ToolExecutionCard } from "./ToolExecutionCard"
import { relativeTime } from "./ThinkingIndicator"

export function ChatMessageBubble({ msg, msgIdx }: { msg: ChatMessage, msgIdx: number }) {
    return (
        <div
            className={`flex flex-col gap-1 w-full relative z-0 ${msg.role === "user" ? "items-end" : "items-start"}`}
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
            {/* Timestamp */}
            <span className="text-[10px] text-muted-foreground px-2 font-medium tracking-wide">
                {msg.status === "done" && msg.role !== 'assistant' && <Check aria-hidden="true" className="inline h-3 w-3 mr-0.5 text-muted" />}
                {relativeTime(msg.timestamp)}
            </span>
        </div>
    )
}
