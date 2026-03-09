import { useRef, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { WelcomeHero } from "./WelcomeHero"
import { ChatMessageBubble } from "./ChatMessageBubble"
import { ThinkingIndicator } from "./ThinkingIndicator"
import { StudioInputArea } from "./StudioInputArea"
import type { ChatMessage, ImageAttachment } from "@/types/studio"

interface StudioChatPanelProps {
    messages: ChatMessage[]
    chatInput: string
    setChatInput: (val: string) => void
    isReady: boolean
    isStreaming: boolean
    isThinking: boolean
    handleSendMessage: (overridePrompt?: string) => void
    handleStop: () => void
    attachedImages: ImageAttachment[]
    setAttachedImages: React.Dispatch<React.SetStateAction<ImageAttachment[]>>
    chatInputRef: React.RefObject<HTMLTextAreaElement | null>
    containerReady: boolean
    isBootingContainer: boolean
}

export function StudioChatPanel({
    messages,
    chatInput,
    setChatInput,
    isReady,
    isStreaming,
    isThinking,
    handleSendMessage,
    handleStop,
    attachedImages,
    setAttachedImages,
    chatInputRef,
    containerReady,
    isBootingContainer
}: StudioChatPanelProps) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const chatEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages, isThinking])

    const fileToBase64 = (file: File): Promise<ImageAttachment> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
                const dataUrl = reader.result as string
                resolve({
                    data: dataUrl.split(",")[1],
                    mimeType: file.type,
                    preview: dataUrl,
                    name: file.name,
                })
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
        })
    }

    const handleImageFiles = async (fileList: FileList | File[]) => {
        const imageFiles = Array.from(fileList).filter((f) =>
            f.type.startsWith("image/")
        ).slice(0, 5 - attachedImages.length)
        const newImages = await Promise.all(imageFiles.map(fileToBase64))
        setAttachedImages((prev) => [...prev, ...newImages].slice(0, 5))
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items
        if (!items) return
        const imageFiles: File[] = []
        for (const item of items) {
            if (item.type.startsWith("image/")) {
                const file = item.getAsFile()
                if (file) imageFiles.push(file)
            }
        }
        if (imageFiles.length > 0) {
            e.preventDefault()
            handleImageFiles(imageFiles)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        if (e.dataTransfer?.files) handleImageFiles(e.dataTransfer.files)
    }

    const removeImage = (index: number) => {
        setAttachedImages((prev) => prev.filter((_, i) => i !== index))
    }

    const handleSuggestionClick = (prompt: string) => {
        setChatInput(prompt)
        setTimeout(() => {
            chatInputRef.current?.focus()
        }, 50)
    }

    const handleRetryMessage = (msgIdx: number) => {
        let prompt = ""
        for (let i = msgIdx - 1; i >= 0; i--) {
            if (messages[i].role === "user") {
                prompt = messages[i].content || ""
                break
            }
        }
        if (prompt) {
            handleSendMessage(prompt)
        }
    }

    return (
        <div className="flex w-[420px] shrink-0 flex-col bg-background relative z-10 border-r border-border">
            <ScrollArea className="flex-1 p-5 pb-0">
                <div className="space-y-6 pb-6">
                    {/* Welcome state */}
                    {isReady && messages.length === 0 && (
                        <WelcomeHero
                            containerReady={containerReady}
                            isBootingContainer={isBootingContainer}
                            onSuggestionClick={handleSuggestionClick}
                        />
                    )}

                    {/* Chat messages */}
                    {messages.map((msg, msgIdx) => (
                        <ChatMessageBubble 
                            key={msg.id} 
                            msg={msg} 
                            msgIdx={msgIdx} 
                            onRetry={msg.role === "assistant" && !isStreaming && msgIdx === messages.length - 1 ? () => handleRetryMessage(msgIdx) : undefined}
                        />
                    ))}

                    {isThinking && <ThinkingIndicator />}
                    <div ref={chatEndRef} />
                </div>
            </ScrollArea>

            <StudioInputArea
                chatInput={chatInput}
                setChatInput={setChatInput}
                isReady={isReady}
                isStreaming={isStreaming}
                handleSendMessage={handleSendMessage}
                handleStop={handleStop}
                attachedImages={attachedImages}
                removeImage={removeImage}
                fileInputRef={fileInputRef}
                handleImageFiles={handleImageFiles}
                handlePaste={handlePaste}
                handleDrop={handleDrop}
                chatInputRef={chatInputRef as any}
            />
        </div>
    )
}
