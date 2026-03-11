import { useRef, useEffect } from "react"
import { Loader2, Wand2 } from "lucide-react"
import { CodeEditor } from "@/components/CodeEditor"
import type { GeneratedFile, RightPanel, ViewportSize } from "@/types/studio"

interface StudioWorkspaceProps {
    rightPanel: RightPanel
    previewUrl: string | null
    isBootingContainer: boolean
    refreshKey: number
    files: GeneratedFile[]
    selectedFile: string | null
    setSelectedFile: (file: string | null) => void
    handleFileEdit: (path: string, content: string) => void
    containerLogs: string[]
    viewportSize: ViewportSize
}

export function StudioWorkspace({
    rightPanel,
    previewUrl,
    isBootingContainer,
    refreshKey,
    files,
    selectedFile,
    setSelectedFile,
    handleFileEdit,
    containerLogs,
    viewportSize
}: StudioWorkspaceProps) {
    const terminalEndRef = useRef<HTMLDivElement>(null)
    const bootingTerminalEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [containerLogs])

    useEffect(() => {
        if (isBootingContainer) {
            bootingTerminalEndRef.current?.scrollIntoView({ behavior: "smooth" })
        }
    }, [containerLogs, isBootingContainer])

    const viewportWidths = { desktop: "100%", tablet: "768px", mobile: "375px" }

    return (
        <div className="flex flex-1 flex-col overflow-hidden relative z-10 bg-background">
            {rightPanel === "preview" && (
                <div className={`flex-1 flex items-center justify-center overflow-auto h-full relative`}>
                    {previewUrl ? (
                        <div
                            className={`transition-all duration-300 ease-in-out bg-background w-full h-full`}
                            style={viewportSize === 'desktop' ? { width: '100%', height: '100%' } : { width: viewportWidths[viewportSize], height: '90%', maxHeight: '920px', borderRadius: '0.75rem', margin: '2rem auto', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}
                        >
                            <iframe
                                key={refreshKey}
                                src={previewUrl}
                                className="h-full w-full border-0"
                                title="Remix Preview"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads align-top bg-white"
                            />
                        </div>
                    ) : isBootingContainer ? (
                        <div className="bg-background rounded-full px-5 py-3 shadow-md border border-border/60 flex items-center gap-3">
                            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                            <span className="text-[13px] font-medium text-foreground">Getting ready...</span>
                        </div>
                    ) : (
                        <div className="bg-background rounded-full px-5 py-3 shadow-md border border-border/60 flex items-center gap-3">
                            <Wand2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-[13px] font-medium text-foreground">Crafting your site...</span>
                        </div>
                    )}
                </div>
            )}

            {rightPanel === "code" && (
                <div className="flex-1 bg-background border-l border-border shadow-sm overflow-hidden">
                    <CodeEditor
                        files={files}
                        selectedFile={selectedFile}
                        onSelectFile={setSelectedFile}
                        onFileChange={handleFileEdit}
                    />
                </div>
            )}

            {rightPanel === "terminal" && (
                <div className="flex-1 overflow-auto bg-[#1e1e1e] p-5 font-mono text-[13px] leading-relaxed shadow-inner">
                    {containerLogs.length === 0 ? (
                        <p className="text-gray-500 italic">Terminal output appears when WebContainer boots…</p>
                    ) : (
                        containerLogs.map((log, i) => {
                            let color = "text-gray-400"
                            if (log.includes("[error]")) color = "text-red-400"
                            else if (log.includes("[server-ready]")) color = "text-emerald-400"
                            else if (log.includes("[install]")) color = "text-blue-400"
                            else color = "text-gray-300"
                            return (
                                <div key={i} className={`font-mono ${color}`}>{log}</div>
                            )
                        })
                    )}
                    <div ref={terminalEndRef} />
                </div>
            )}
        </div>
    )
}
