// ** import core packages
import { useCallback, useMemo, useRef, useState } from "react"
import { ThreadPrimitive, useAuiState } from "@assistant-ui/react"

// ** import types
import type { ChatMessage, ImageAttachment } from "@/types/studio"

// ** import lib
import { WelcomeHero } from "./WelcomeHero"
import { ChatMessageBubble } from "./ChatMessageBubble"
import { ThinkingIndicator } from "./ThinkingIndicator"
import { StudioInputArea } from "./StudioInputArea"

interface StudioChatPanelProps {
    messages: ChatMessage[]
    chatInput: string
    setChatInput: (val: string) => void
    isReady: boolean
    isStreaming: boolean
    isThinking: boolean
    handleSendMessage: (overridePrompt?: string, mode?: string) => void
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
    const [selectedMode, setSelectedMode] = useState("Chat")

    const messagesById = useMemo(() => {
        return new Map(messages.map((message) => [message.id, message]))
    }, [messages])

    const messageIndexById = useMemo(() => {
        return new Map(messages.map((message, index) => [message.id, index]))
    }, [messages])

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

    const handleRetryMessage = useCallback((msgIdx: number) => {
        let prompt = ""
        for (let i = msgIdx - 1; i >= 0; i--) {
            if (messages[i].role === "user") {
                prompt = messages[i].content || ""
                break
            }
        }
        if (prompt) {
            handleSendMessage(prompt, selectedMode)
        }
    }, [messages, handleSendMessage, selectedMode])

    const getRetryHandler = useCallback((messageId: string) => {
        const message = messagesById.get(messageId)
        const messageIndex = messageIndexById.get(messageId)

        if (!message || message.role !== "assistant") return undefined
        if (typeof messageIndex !== "number") return undefined
        if (isStreaming || messageIndex !== messages.length - 1) return undefined

        return () => handleRetryMessage(messageIndex)
    }, [messagesById, messageIndexById, isStreaming, messages.length, handleRetryMessage])

    const ThreadMessage = () => {
        const messageId = useAuiState((s) => s.message.id)
        const msg = messagesById.get(messageId)
        const msgIdx = messageIndexById.get(messageId) ?? 0

        if (!msg) return null

        return (
            <ChatMessageBubble
                msg={msg}
                msgIdx={msgIdx}
                onRetry={getRetryHandler(messageId)}
            />
        )
    }

    return (
        <div className="flex w-[420px] shrink-0 flex-col bg-background relative z-10 border-r border-border">
            <ThreadPrimitive.Root className="flex-1 min-h-0">
                <ThreadPrimitive.Viewport className="h-full overflow-y-auto px-5 pt-5 pb-4">
                    <div className="space-y-6 pb-2">
                        <ThreadPrimitive.Empty>
                            {isReady && (
                                <WelcomeHero
                                    containerReady={containerReady}
                                    isBootingContainer={isBootingContainer}
                                    onSuggestionClick={handleSuggestionClick}
                                />
                            )}
                        </ThreadPrimitive.Empty>

                        <ThreadPrimitive.Messages
                            components={{
                                Message: ThreadMessage,
                            }}
                        />

                        {isThinking && <ThinkingIndicator />}
                    </div>
                </ThreadPrimitive.Viewport>
            </ThreadPrimitive.Root>

            <div className="shrink-0 border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
                    selectedMode={selectedMode}
                    setSelectedMode={setSelectedMode}
                />
            </div>
        </div>
    )
}
