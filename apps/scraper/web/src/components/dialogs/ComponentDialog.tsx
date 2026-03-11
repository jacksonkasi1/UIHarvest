// ** import core packages
import { useState } from "react"

// ** import icons
import { Palette, Layout, Info, Layers, Boxes, Copy, Check, Maximize2, X } from "lucide-react"

// ** import ui components
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

// ** import utils
import { typeColor, formatHtml, copyToClipboard } from "@/lib/helpers"
import { MetricBox } from "@/components/shared"
import { useOutputUrl } from "@/lib/output-base"

// ** import types
import type { DesignSystemData } from "@/types/design-system"

interface ComponentDialogProps {
  selectedComp: any
  setSelectedComp: (comp: any) => void
  data: DesignSystemData
}

function ImageZoomModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-background/90 flex items-center justify-center backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground bg-background/50 hover:bg-background/80 rounded-full p-2 transition-colors z-20"
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>
      <div
        className="relative w-full h-full max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-contain filter drop-shadow-2xl animate-in zoom-in-95 duration-200"
        />
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    copyToClipboard(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/50 shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function SectionHeading({ icon: Icon, title, rightAction = null }: { icon: any, title: string, rightAction?: any }) {
  return (
    <div className="flex items-center justify-between mb-3 mt-6 first:mt-0">
      <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h3>
      {rightAction}
    </div>
  )
}

export function ComponentDialog({ selectedComp, setSelectedComp, data }: ComponentDialogProps) {
  const [zoomOpen, setZoomOpen] = useState(false)
  const outputUrl = useOutputUrl()

  if (!selectedComp) return null

  const children = selectedComp.children ? selectedComp.children.map((id: string) => data.components.find((c: any) => c.id === id)).filter(Boolean) : []
  const parent = selectedComp.parentId ? data.components.find((c: any) => c.id === selectedComp.parentId) : null
  const pattern = selectedComp.patternId ? (data.patterns || []).find((p: any) => p.id === selectedComp.patternId) : null
  const styleEntries = Object.entries(selectedComp.styles || {}).filter(([_, v]) => v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== '')
  const hoverState = data.interactions?.hoverStates?.find((h: any) => h.componentId === selectedComp.id)
  const formattedHtml = formatHtml(selectedComp.html)

  return (
    <>
      {zoomOpen && (
        <ImageZoomModal
          src={outputUrl(selectedComp.screenshot)}
          alt={selectedComp.name}
          onClose={() => setZoomOpen(false)}
        />
      )}
      <Dialog open={!!selectedComp} onOpenChange={(o) => !o && setSelectedComp(null)}>
        <DialogContent className="min-w-6xl h-[85vh] bg-background border-border text-foreground flex flex-col p-0 overflow-hidden shadow-2xl gap-0">

          {/* Header */}
          <DialogHeader className="px-5 py-3 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: typeColor(selectedComp.type) }} />
              <DialogTitle className="text-sm font-medium leading-tight pr-8 flex items-baseline gap-2">
                <span className="text-muted-foreground font-normal text-xs">{selectedComp.type}/{selectedComp.subType}</span>
                <span className="truncate">{selectedComp.name}</span>
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* Body Layout: Split Left (Content) & Right (Styles) */}
          <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden bg-background">

            {/* LEFT COLUMN: Main Details */}
            <ScrollArea className="flex-1 border-r border-border h-full">
              <div className="p-5 max-w-3xl">

                {/* Image Preview - Hugs content to prevent massive empty boxes */}
                {selectedComp.screenshot && (
                  <div className="mb-6 relative group/img inline-flex rounded-md border border-border/60 bg-muted/10 p-2 shadow-sm max-w-full">
                    <img
                      src={outputUrl(selectedComp.screenshot)}
                      alt={selectedComp.name}
                      className="max-h-[180px] object-contain block relative z-10"
                    />
                    <button
                      onClick={() => setZoomOpen(true)}
                      className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 bg-background/20 backdrop-blur-[1px] rounded-md"
                    >
                      <div className="bg-foreground/90 rounded-full p-2.5 shadow-xl transform transition-transform group-hover/img:scale-110">
                        <Maximize2 className="w-4 h-4 text-background" />
                      </div>
                    </button>
                  </div>
                )}

                {/* Metrics */}
                <SectionHeading icon={Layout} title="Metrics" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                  <MetricBox label="Width" value={`${Math.round(selectedComp.rect.width)}px`} />
                  <MetricBox label="Height" value={`${Math.round(selectedComp.rect.height)}px`} />
                  <MetricBox label="X Pos" value={Math.round(selectedComp.rect.x)} />
                  <MetricBox label="Y Pos" value={Math.round(selectedComp.rect.y)} />
                </div>

                {/* Hover State */}
                {hoverState && (
                  <>
                    <SectionHeading icon={Palette} title="Hover State Transitions" />
                    <div className="bg-muted/10 border border-border/60 rounded-md p-4 mb-6">
                      <div className="flex gap-4 border-b border-border/50 pb-4 mb-3">
                        <div className="flex flex-col gap-1.5 w-32">
                          <span className="text-[10px] text-muted-foreground font-semibold tracking-wider">DEFAULT</span>
                          <div className="flex items-center justify-center bg-background border border-border/50 rounded p-1.5 h-[60px]">
                            {selectedComp.screenshot && <img src={outputUrl(selectedComp.screenshot)} className="max-h-full object-contain" />}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 w-32">
                          <span className="text-[10px] text-muted-foreground font-semibold tracking-wider">HOVER</span>
                          <div className="flex items-center justify-center bg-background border border-border/50 rounded p-1.5 h-[60px]">
                            {hoverState.screenshotHover && <img src={outputUrl(hoverState.screenshotHover)} className="max-h-full object-contain" />}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 pt-1">
                        {Object.entries(hoverState.changes).map(([k, v]: [string, any]) => (
                          <div key={k} className="flex gap-2 text-xs font-mono items-center">
                            <span className="text-muted-foreground w-24 truncate">{k}</span>
                            <span className="text-red-400 truncate flex-1 min-w-0" title={v.from}>{v.from}</span>
                            <span className="text-muted-foreground shrink-0">→</span>
                            <span className="text-green-500 truncate flex-1 min-w-0" title={v.to}>{v.to}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Info & Attributes */}
                {(parent || pattern || Object.keys(selectedComp.dataAttributes || {}).length > 0) && (
                  <>
                    <SectionHeading icon={Info} title="Info & Attributes" />
                    <div className="flex flex-wrap gap-2 mb-6">
                      {parent && (
                        <div className="flex items-center gap-2 bg-muted/20 rounded border border-border/60 px-2.5 py-1.5 text-xs font-mono">
                          <span className="text-muted-foreground">Parent:</span>
                          <span className="text-primary cursor-pointer hover:underline truncate max-w-[200px]" onClick={() => setSelectedComp(parent)}>{parent.type}: {parent.name}</span>
                        </div>
                      )}
                      {pattern && (
                        <div className="flex items-center gap-2 bg-muted/20 rounded border border-border/60 px-2.5 py-1.5 text-xs font-mono">
                          <span className="text-muted-foreground">Pattern:</span>
                          <span className="text-[#f59e0b] truncate max-w-[200px]">{pattern.name} ({pattern.instanceCount}×)</span>
                        </div>
                      )}
                      {Object.entries(selectedComp.dataAttributes || {}).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2 bg-muted/20 rounded border border-border/60 px-2.5 py-1.5 text-xs font-mono">
                          <span className="text-muted-foreground">{k}:</span>
                          <span className="text-foreground/90 truncate max-w-[200px]">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Sub-Components */}
                {children.length > 0 && (
                  <>
                    <SectionHeading icon={Layers} title={`Sub-Components (${children.length})`} />
                    <div className="flex flex-wrap gap-2 mb-6">
                      {children.map((ch: any) => (
                        <Badge key={ch.id} variant="secondary" className="cursor-pointer hover:bg-muted font-normal text-xs flex items-center gap-1.5 py-1 px-2.5" onClick={() => setSelectedComp(ch)}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColor(ch.type) }} />
                          <span className="truncate max-w-[200px]">{ch.type}: {ch.name}</span>
                        </Badge>
                      ))}
                    </div>
                  </>
                )}

                {/* HTML Source */}
                <SectionHeading icon={Boxes} title="HTML Source" rightAction={<CopyButton text={formattedHtml} />} />
                <div className="relative rounded-md border border-border bg-[#0D1117] overflow-hidden">
                  <ScrollArea className="w-full max-h-[300px]">
                    <pre className="p-4 text-xs font-mono text-gray-300 whitespace-pre w-max min-w-full leading-relaxed">
                      {formattedHtml}
                    </pre>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>

              </div>
            </ScrollArea>

            {/* RIGHT COLUMN: Computed Styles */}
            <div className="w-full md:w-[280px] shrink-0 bg-muted/5 flex flex-col h-full">
              <div className="px-4 py-3 border-b border-border bg-muted/10 shrink-0">
                <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <Palette className="w-3.5 h-3.5" /> Computed Styles
                </h3>
              </div>
              <ScrollArea className="flex-1">
                <div className="px-4 py-2">
                  {styleEntries.map(([k, v]) => (
                    <div key={k} className="py-2.5 border-b border-border/40 last:border-0 flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground font-mono">{k}</span>
                      <span className="text-xs text-foreground/90 font-mono break-words">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}