// ** import core packages
import { useState, useRef } from "react"
import { X } from "lucide-react"

// ** import hooks
import { useWebContainer } from "@/hooks/studio/useWebContainer"
import { useRemixChat } from "@/hooks/studio/useRemixChat"

// ** import components
import { StudioHeader } from "@/components/studio/StudioHeader"
import { StudioChatPanel } from "@/components/studio/StudioChatPanel"
import { StudioWorkspace } from "@/components/studio/StudioWorkspace"

// ** import types
import type { RightPanel, ViewportSize, GeneratedFile } from "@/types/studio"

interface RemixStudioProps {
    jobId: string
    onBack: () => void
}

export function RemixStudioView({ jobId, onBack }: RemixStudioProps) {
    const [selectedFile, setSelectedFile] = useState<string | null>(null)
    const [rightPanel, setRightPanel] = useState<RightPanel>("preview")
    const [viewportSize, setViewportSize] = useState<ViewportSize>("desktop")
    const [isChatExpanded, setIsChatExpanded] = useState(true)
    
    // State
    const [files, setFiles] = useState<GeneratedFile[]>([])
    const [containerReady, setContainerReady] = useState(false)

    // Hooks
    const { 
        isBootingContainer, 
        previewUrl, 
        error, 
        setError, 
        phase, 
        statusMessage 
    } = useWebContainer(jobId, setFiles, setSelectedFile, setContainerReady, containerReady)

    const { 
        messages, 
        chatInput, 
        setChatInput, 
        isStreaming, 
        isThinking, 
        attachedImages, 
        setAttachedImages, 
        containerLogs, 
        refreshKey, 
        setRefreshKey, 
        handleSendMessage, 
        handleStop, 
        chatInputRef 
    } = useRemixChat(jobId, containerReady, setFiles)

    const isReady = phase === "ready"
    const isError = phase === "error"

    const handleRefreshPreview = () => setRefreshKey(prev => prev + 1)
    
    const pendingEditsRef = useRef(new Map<string, string>())
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    
    const handleFileEdit = (path: string, newContent: string) => {
        // Update local React state
        setFiles(prev => prev.map(f => (f.path === path ? { ...f, content: newContent } : f)))
        
        // Track all pending edits across different files
        pendingEditsRef.current.set(path, newContent)
        
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        
        saveTimeoutRef.current = setTimeout(async () => {
            const edits = Array.from(pendingEditsRef.current.entries())
            pendingEditsRef.current.clear()

            // 1. Sync to WebContainer
            if (containerReady) {
                const { writeFiles } = await import("@/lib/webcontainer")
                writeFiles(edits.map(([p, c]) => ({ path: p, content: c }))).catch(console.error)
            }
            
            // 2. Persist to backend (Durable manual edits)
            for (const [p, c] of edits) {
                try {
                    await fetch(`/api/remix/${jobId}/files`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ path: p, content: c })
                    })
                } catch (err) {
                    console.error(`[Studio] Failed to persist file edit to backend for ${p}:`, err)
                }
            }
        }, 1000)
    }

    const handleDownloadAll = () => {
        const content = files.map((f) => `// ═══ ${f.path} ═══\n${f.content}`).join("\n\n")
        const blob = new Blob([content], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `remix-${jobId}.txt`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="flex h-dvh w-full flex-col bg-background text-foreground overflow-hidden font-sans">
            <StudioHeader 
                isReady={isReady}
                isBootingContainer={isBootingContainer}
                statusMessage={statusMessage}
                rightPanel={rightPanel}
                setRightPanel={setRightPanel}
                previewUrl={previewUrl}
                handleRefreshPreview={handleRefreshPreview}
                onBack={onBack}
                viewportSize={viewportSize}
                setViewportSize={setViewportSize}
                isChatExpanded={isChatExpanded}
                onToggleChat={() => setIsChatExpanded(!isChatExpanded)}
                projectName="Elegant Portfolio"
            />

            {isError && error && (
                <div className="border-b border-destructive/20 bg-destructive/10 px-6 py-2 text-[13px] text-destructive flex items-center justify-between z-20 relative font-medium">
                    <span>{error}</span>
                    <button aria-label="Dismiss error" onClick={() => setError(null)} className="hover:bg-destructive/20 p-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"><X aria-hidden="true" className="h-4 w-4" /></button>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden relative">
                {isChatExpanded && (
                    <StudioChatPanel 
                        messages={messages}
                        chatInput={chatInput}
                        setChatInput={setChatInput}
                        isReady={isReady}
                        isStreaming={isStreaming}
                        isThinking={isThinking}
                        handleSendMessage={handleSendMessage}
                        handleStop={handleStop}
                        attachedImages={attachedImages}
                        setAttachedImages={setAttachedImages}
                        chatInputRef={chatInputRef as any}
                        containerReady={containerReady}
                        isBootingContainer={isBootingContainer}
                    />
                )}

                <StudioWorkspace 
                    rightPanel={rightPanel}
                    previewUrl={previewUrl}
                    isBootingContainer={isBootingContainer}
                    refreshKey={refreshKey}
                    files={files}
                    selectedFile={selectedFile}
                    setSelectedFile={setSelectedFile}
                    handleFileEdit={handleFileEdit}
                    containerLogs={containerLogs}
                    viewportSize={viewportSize}
                />
            </div>
        </div>
    )
}
