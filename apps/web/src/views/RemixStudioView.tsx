// ** import core packages
import { useState, useRef } from "react"
import { X } from "lucide-react"

// ** import hooks
import { useProjectContainer } from "@/hooks/studio/useProjectContainer"
import { useRemixChat } from "@/hooks/studio/useRemixChat"

// ** import components
import { StudioHeader } from "@/components/studio/StudioHeader"
import { StudioChatPanel } from "@/components/studio/StudioChatPanel"
import { StudioWorkspace } from "@/components/studio/StudioWorkspace"

// ** import types
import type { RightPanel, ViewportSize, GeneratedFile } from "@/types/studio"

interface RemixStudioProps {
    projectId: string
    onBack: () => void
}

export function RemixStudioView({ projectId, onBack }: RemixStudioProps) {
    const [selectedFile, setSelectedFile] = useState<string | null>(null)
    const [rightPanel, setRightPanel] = useState<RightPanel>("preview")
    const [viewportSize, setViewportSize] = useState<ViewportSize>("desktop")
    const [isChatExpanded, setIsChatExpanded] = useState(true)

    const studioId = projectId

    // State
    const [files, setFiles] = useState<GeneratedFile[]>([])
    const [containerReady, setContainerReady] = useState(false)
    // Shared terminal log state — fed by both container hook and useRemixChat
    const [containerLogs, setContainerLogs] = useState<string[]>([])

    const projectContainerResult = useProjectContainer(
        studioId,
        setFiles,
        setSelectedFile,
        setContainerReady,
        containerReady,
        setContainerLogs,
    )

    const {
        isBootingContainer,
        previewUrl,
        error,
        setError,
        phase,
        statusMessage,
        projectName,
        setProjectName,
        setHardReloadKey,
        handleHardReset,
    } = projectContainerResult

    const {
        messages,
        chatInput,
        setChatInput,
        isStreaming,
        isThinking,
        attachedImages,
        setAttachedImages,
        refreshKey,
        setRefreshKey,
        handleSendMessage,
        handleStop,
        chatInputRef,
        RuntimeProvider,
    } = useRemixChat(studioId, containerReady, setFiles, setContainerLogs)

    const isReady = phase === "ready"
    const isError = phase === "error"

    const handleRefreshPreview = () => {
        setRefreshKey(prev => prev + 1)
        setHardReloadKey(prev => prev + 1)
    }

    const handleRenameProject = async (newName: string) => {
        setProjectName?.(newName)
        try {
            await fetch(`/api/projects/${studioId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name: newName })
            })
        } catch (err) {
            console.error("Failed to rename project", err)
        }
    }

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

            // 2. Persist to backend
            const filesEndpoint = `/api/projects/${studioId}/files`

            for (const [p, c] of edits) {
                try {
                    await fetch(filesEndpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ path: p, content: c })
                    })
                } catch (err) {
                    console.error(`[Studio] Failed to persist file edit for ${p}:`, err)
                }
            }
        }, 1000)
    }

    return (
        <RuntimeProvider>
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
                projectName={projectName}
                onRenameProject={handleRenameProject}
                onHardReset={handleHardReset}
                error={error}
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
                        chatInputRef={chatInputRef}
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
        </RuntimeProvider>
    )
}
