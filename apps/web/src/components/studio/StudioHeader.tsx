// ** import core packages
import { ChevronDown, Globe, Palette, Code2, Terminal, RefreshCw, Monitor, ArrowUpRight, History, PanelLeft, Smartphone, Tablet } from "lucide-react"

// ** import components
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"

// ** import types
import type { RightPanel, ViewportSize } from "@/types/studio"

interface StudioHeaderProps {
    isReady: boolean
    isBootingContainer: boolean
    statusMessage: string
    rightPanel: RightPanel
    setRightPanel: (panel: RightPanel) => void
    previewUrl: string | null
    handleRefreshPreview: () => void
    onBack: () => void
    viewportSize: ViewportSize
    setViewportSize: (size: ViewportSize) => void
    isChatExpanded: boolean
    onToggleChat: () => void
    projectName?: string
}

export function StudioHeader({
    isReady,
    isBootingContainer,
    statusMessage,
    rightPanel,
    setRightPanel,
    previewUrl,
    handleRefreshPreview,
    onBack,
    viewportSize,
    setViewportSize,
    isChatExpanded,
    onToggleChat,
    projectName = "Elegant Portfolio"
}: StudioHeaderProps) {
    return (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 relative z-20">
            <div className="flex items-center gap-4 min-w-0">
                {/* Logo & Back button */}
                <button aria-label="Go back" onClick={onBack} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl transition-transform hover:scale-105">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF512F] via-[#F09819] to-[#DD2476] flex items-center justify-center shadow-sm" style={{ borderRadius: '10px 10px 10px 4px' }}>
                        <div className="w-3 h-3 rounded-full bg-white/20 backdrop-blur-sm" />
                    </div>
                </button>
                
                {/* Title & Subtitle */}
                <div className="flex flex-col min-w-0 mr-4">
                    <div className="flex items-center gap-1.5 cursor-pointer group">
                        <span className="text-[14px] font-semibold text-foreground truncate group-hover:text-foreground/80 transition-colors">
                            {projectName}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                    <span className="text-[12px] text-muted-foreground truncate font-medium flex items-center gap-1.5">
                        {isReady ? "Ready to edit" :
                            isBootingContainer ? "Loading Live Preview…" : statusMessage}
                    </span>
                </div>

                {/* Left side actions */}
                <div className="flex items-center gap-2">
                    <button aria-label="Toggle Chat" onClick={onToggleChat} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ml-1 ${isChatExpanded ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"}`}>
                        <PanelLeft className="w-[18px] h-[18px]" />
                    </button>
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 min-w-0">
                {/* Right side tools */}
                {isReady && (
                    <div className="flex items-center gap-1.5">
                        <button
                            aria-label="View Preview"
                            className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 h-8 text-[13px] font-semibold transition-all gap-1.5 ${rightPanel === "preview" ? "bg-[#E0E7FF] dark:bg-blue-900/40 text-[#4338CA] dark:text-blue-300 border border-[#C7D2FE] dark:border-blue-800/50" : "bg-background border border-border/50 text-muted-foreground hover:text-foreground shadow-sm"}`}
                            onClick={() => setRightPanel("preview")}
                        >
                            <Globe className="h-[15px] w-[15px]" />
                            Preview
                        </button>
                        <button className="inline-flex items-center justify-center rounded-lg border border-border/60 bg-background hover:bg-secondary/80 w-8 h-8 text-muted-foreground hover:text-foreground shadow-sm transition-all">
                            <Palette className="h-[15px] w-[15px]" />
                        </button>
                        <button
                            aria-label="View Code"
                            className={`inline-flex items-center justify-center rounded-lg border transition-all w-8 h-8 ${rightPanel === "code" ? "bg-[#E0E7FF] dark:bg-blue-900/40 border-[#C7D2FE] dark:border-blue-800/50 text-[#4338CA] dark:text-blue-300" : "border-border/60 bg-background hover:bg-secondary/80 text-muted-foreground hover:text-foreground shadow-sm"}`}
                            onClick={() => setRightPanel("code")}
                        >
                            <Code2 className="h-[15px] w-[15px]" />
                        </button>
                        <button
                            aria-label="View Terminal"
                            className={`inline-flex items-center justify-center rounded-lg border transition-all w-8 h-8 ${rightPanel === "terminal" ? "bg-[#E0E7FF] dark:bg-blue-900/40 border-[#C7D2FE] dark:border-blue-800/50 text-[#4338CA] dark:text-blue-300" : "border-border/60 bg-background hover:bg-secondary/80 text-muted-foreground hover:text-foreground shadow-sm"}`}
                            onClick={() => setRightPanel("terminal")}
                        >
                            <Terminal className="h-[15px] w-[15px]" />
                        </button>
                        <button className="inline-flex items-center justify-center rounded-lg border border-border/60 bg-background hover:bg-secondary/80 w-8 h-8 text-muted-foreground hover:text-foreground shadow-sm transition-all">
                            <History className="h-[15px] w-[15px]" />
                        </button>
                    </div>
                )}

                {/* URL bar */}
                {isReady && rightPanel === "preview" && previewUrl && (
                    <div className="ml-2 flex items-center bg-background border border-border/60 rounded-full pl-3 pr-1 h-[34px] text-[13px] text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.02)] w-[260px] justify-between group hover:border-border transition-colors">
                        <div className="flex items-center gap-2.5 truncate">
                            <DropdownMenu>
                                <DropdownMenuTrigger className="flex items-center justify-center hover:bg-secondary rounded-sm p-0.5 transition-colors focus-visible:outline-none">
                                    {viewportSize === "desktop" ? <Monitor className="w-[15px] h-[15px] text-muted-foreground/80 shrink-0" /> : viewportSize === "tablet" ? <Tablet className="w-[15px] h-[15px] text-muted-foreground/80 shrink-0" /> : <Smartphone className="w-[15px] h-[15px] text-muted-foreground/80 shrink-0" />}
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={() => setViewportSize("desktop")} className="gap-2 cursor-pointer"><Monitor className="w-4 h-4" /> Desktop</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setViewportSize("tablet")} className="gap-2 cursor-pointer"><Tablet className="w-4 h-4" /> Tablet</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setViewportSize("mobile")} className="gap-2 cursor-pointer"><Smartphone className="w-4 h-4" /> Mobile</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <span className="truncate max-w-[150px] text-foreground font-medium text-[13px]">
                                {previewUrl ? previewUrl.replace(/^https?:\/\//, '') : '/'}
                            </span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                            <a href={previewUrl || "#"} target="_blank" rel="noopener noreferrer" className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                                <ArrowUpRight className="w-4 h-4" />
                            </a>
                            <button aria-label="Refresh Preview" onClick={handleRefreshPreview} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none">
                                <RefreshCw className="w-[15px] h-[15px]" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </header>
    )
}
