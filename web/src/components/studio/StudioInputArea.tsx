import { useState } from "react"
import { MessageSquare, ArrowUp, X, Paperclip, ChevronDown, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ImageAttachment } from "@/types/studio"

interface StudioInputAreaProps {
    chatInput: string
    setChatInput: (val: string) => void
    isReady: boolean
    isStreaming: boolean
    handleSendMessage: () => void
    handleStop: () => void
    attachedImages: ImageAttachment[]
    removeImage: (idx: number) => void
    fileInputRef: React.RefObject<HTMLInputElement | null>
    handleImageFiles: (files: FileList | File[]) => void
    handlePaste: (e: React.ClipboardEvent) => void
    handleDrop: (e: React.DragEvent) => void
    chatInputRef: React.RefObject<HTMLTextAreaElement | null>
}

export function StudioInputArea({
    chatInput,
    setChatInput,
    isReady,
    isStreaming,
    handleSendMessage,
    handleStop,
    attachedImages,
    removeImage,
    fileInputRef,
    handleImageFiles,
    handlePaste,
    handleDrop,
    chatInputRef
}: StudioInputAreaProps) {
    const [isDraggingOver, setIsDraggingOver] = useState(false)
    const [selectedMode, setSelectedMode] = useState("Chat")

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDraggingOver(true)
    }

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDraggingOver(false)
    }

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDraggingOver(false)
        handleDrop(e)
    }

    return (
        <div 
            className={`bg-transparent px-4 pb-4 pt-2 transition-all duration-200 ${isDraggingOver ? 'bg-primary/5 rounded-[2rem] mx-2 border border-dashed border-primary/30' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                name="image-attachment"
                className="hidden"
                onChange={(e) => {
                    if (e.target.files) handleImageFiles(e.target.files)
                    e.target.value = ""
                }}
            />

            <div className={`bg-white rounded-[1.5rem] p-1.5 shadow-sm focus-within:shadow-md transition-shadow relative ${isDraggingOver ? 'border-primary/50 border ring-4 ring-primary/10' : 'border border-border/60'}`}>
                {isDraggingOver && (
                    <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm rounded-[1.5rem] flex items-center justify-center border-2 border-dashed border-primary/50 text-primary font-medium pointer-events-none">
                        Drop images here to attach...
                    </div>
                )}
                {attachedImages.length > 0 && (
                    <div className="p-2 pb-1 flex gap-2 flex-wrap">
                        {attachedImages.map((img, i) => (
                            <div key={i} className="relative group">
                                <img src={img.preview} alt={img.name} width={40} height={40} className="h-10 w-10 rounded-lg object-cover border border-border shadow-sm" />
                                <button
                                    aria-label="Remove image"
                                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-[opacity,transform] scale-90 group-hover:scale-100 shadow-md"
                                    onClick={() => removeImage(i)}
                                >
                                    <X aria-hidden="true" className="h-2.5 w-2.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex flex-col w-full">
                    <Textarea
                        ref={chatInputRef}
                        aria-label="Chat input"
                        name="chat"
                        autoComplete="off"
                        className="w-full min-h-[44px] max-h-[200px] resize-none bg-transparent border-0 text-[14px] py-3 px-3 text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder={isReady ? "Ask UI Harvest to modify…" : "Waiting…"}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        disabled={!isReady || isStreaming}
                        rows={1}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            if (target.scrollHeight !== target.clientHeight) {
                                target.style.height = 'auto';
                                target.style.height = `${target.scrollHeight}px`;
                            }
                        }}
                    />

                    <div className="flex items-center justify-between px-2 py-1.5">
                        <div className="flex gap-1.5 items-center">
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 rounded-full px-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 font-medium text-[12px]"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Paperclip aria-hidden="true" className="w-3.5 h-3.5 mr-1.5" />
                                Attach
                            </Button>
                            
                            <DropdownMenu>
                                <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap h-8 rounded-full px-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 font-medium text-[12px]">
                                    {selectedMode}
                                    <ChevronDown aria-hidden="true" className="w-3 h-3 ml-1" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-32">
                                    <DropdownMenuItem onClick={() => setSelectedMode("Chat")}>Chat</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSelectedMode("Yolo")}>Yolo</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setSelectedMode("Smart")}>Smart</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <div className="flex gap-1.5 items-center">
                            <div className="flex items-center text-[12px] font-medium text-muted-foreground mr-1">
                                <MessageSquare aria-hidden="true" className="w-3.5 h-3.5 mr-1.5" />
                                Chat
                            </div>
                            {isStreaming ? (
                                <Button
                                    size="icon"
                                    aria-label="Stop generation"
                                    variant="secondary"
                                    className="h-8 w-8 rounded-full transition-colors"
                                    onClick={handleStop}
                                >
                                    <Square aria-hidden="true" className="h-3 w-3 fill-current" />
                                </Button>
                            ) : (
                                <Button
                                    size="icon"
                                    aria-label="Send message"
                                    variant="default"
                                    className="h-8 w-8 rounded-full transition-colors disabled:opacity-20"
                                    disabled={!isReady || !chatInput.trim()}
                                    onClick={handleSendMessage}
                                >
                                    <ArrowUp aria-hidden="true" className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
