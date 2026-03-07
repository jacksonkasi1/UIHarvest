// ** import core packages
import { useState } from "react"

// ** import icons
import { Palette, Layout, Info, Layers, Boxes, Copy, Check, Maximize2, X } from "lucide-react"

// ** import ui components
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

// ** import utils
import { typeColor, formatHtml, copyToClipboard } from "@/lib/helpers"
import { MetricBox } from "@/components/shared"

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
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors z-10"
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
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
      className="p-1.5 rounded-md bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-colors border border-border/50"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

export function ComponentDialog({ selectedComp, setSelectedComp, data }: ComponentDialogProps) {
  const [zoomOpen, setZoomOpen] = useState(false)

  if (!selectedComp) return null

  const children = selectedComp.children ? selectedComp.children.map((id: string) => data.components.find((c: any) => c.id === id)).filter(Boolean) : []
  const parent = selectedComp.parentId ? data.components.find((c: any) => c.id === selectedComp.parentId) : null
  const pattern = selectedComp.patternId ? (data.patterns || []).find((p: any) => p.id === selectedComp.patternId) : null
  const styleEntries = Object.entries(selectedComp.styles || {}).filter(([_,v]) => v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== '')
  const hoverState = data.interactions?.hoverStates?.find((h: any) => h.componentId === selectedComp.id)
  const formattedHtml = formatHtml(selectedComp.html)

  return (
    <>
      {zoomOpen && (
        <ImageZoomModal
          src={`/output/${selectedComp.screenshot}`}
          alt={selectedComp.name}
          onClose={() => setZoomOpen(false)}
        />
      )}
      <Dialog open={!!selectedComp} onOpenChange={(o) => !o && setSelectedComp(null)}>
        <DialogContent className="max-w-4xl sm:max-w-4xl max-h-[90vh] bg-background border-border text-foreground flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border bg-background/80 backdrop-blur shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: typeColor(selectedComp.type) }} />
              <DialogTitle className="text-base leading-tight pr-8">
                <span className="text-muted-foreground font-normal text-sm">{selectedComp.type}/{selectedComp.subType}:</span>{" "}
                <span className="break-words">{selectedComp.name}</span>
              </DialogTitle>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="p-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 space-y-4 min-w-0">

                  {/* Image Preview */}
                  {selectedComp.screenshot && (
                    <div className="relative group/img rounded-lg border border-border bg-muted/20 overflow-hidden h-[200px] flex items-center justify-center ring-1 ring-inset ring-foreground/5">
                      <img
                        src={`/output/${selectedComp.screenshot}`}
                        alt={selectedComp.name}
                        className="max-w-full max-h-full object-contain relative z-10"
                      />
                      <button
                        onClick={() => setZoomOpen(true)}
                        className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 bg-black/30"
                        title="Expand image"
                      >
                        <div className="bg-black/60 rounded-full p-2">
                          <Maximize2 className="w-5 h-5 text-white" />
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Hover State */}
                  {hoverState && (
                    <div>
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5"><Palette className="w-3 h-3" /> Hover State</h3>
                      <div className="bg-card border border-border rounded-md p-3">
                        <div className="flex gap-3 border-b border-border pb-3 mb-3">
                          <div className="flex-1 text-center bg-muted/30 p-3 rounded-md">
                            <div className="text-[9px] text-muted-foreground font-semibold tracking-wider mb-2">DEFAULT</div>
                            {selectedComp.screenshot && <img src={`/output/${selectedComp.screenshot}`} className="max-h-[80px] object-contain mx-auto" />}
                          </div>
                          <div className="flex-1 text-center bg-muted/30 p-3 rounded-md">
                            <div className="text-[9px] text-muted-foreground font-semibold tracking-wider mb-2">HOVER</div>
                            {hoverState.screenshotHover && <img src={`/output/${hoverState.screenshotHover}`} className="max-h-[80px] object-contain mx-auto" />}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                          {Object.entries(hoverState.changes).map(([k, v]: [string, any]) => (
                            <div key={k} className="flex gap-2 text-[10px] font-mono">
                              <span className="text-muted-foreground min-w-[100px]">{k}</span>
                              <span className="text-red-400 truncate flex-1" title={v.from}>{v.from}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-green-500 truncate flex-1" title={v.to}>{v.to}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Metrics */}
                  <div>
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5"><Layout className="w-3 h-3" /> Metrics</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <MetricBox label="Width" value={`${Math.round(selectedComp.rect.width)}px`} />
                      <MetricBox label="Height" value={`${Math.round(selectedComp.rect.height)}px`} />
                      <MetricBox label="X Pos" value={Math.round(selectedComp.rect.x)} />
                      <MetricBox label="Y Pos" value={Math.round(selectedComp.rect.y)} />
                    </div>
                  </div>

                  {/* Info & Attributes */}
                  {(parent || pattern || Object.keys(selectedComp.dataAttributes || {}).length > 0) && (
                    <div>
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5"><Info className="w-3 h-3" /> Info & Attributes</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {parent && (
                          <div className="flex flex-col bg-muted/30 rounded-md border border-border/50 p-2 text-xs font-mono">
                            <span className="text-muted-foreground mb-1 text-[10px]">Parent</span>
                            <span className="text-primary cursor-pointer hover:underline truncate" onClick={() => setSelectedComp(parent)} title={`${parent.type}: ${parent.name}`}>{parent.type}: {parent.name}</span>
                          </div>
                        )}
                        {pattern && (
                          <div className="flex flex-col bg-muted/30 rounded-md border border-border/50 p-2 text-xs font-mono">
                            <span className="text-muted-foreground mb-1 text-[10px]">Pattern</span>
                            <span className="text-[#f59e0b] truncate" title={`${pattern.name} (${pattern.instanceCount}×)`}>{pattern.name} ({pattern.instanceCount}×)</span>
                          </div>
                        )}
                        {Object.entries(selectedComp.dataAttributes || {}).map(([k, v]) => (
                          <div key={k} className="flex flex-col bg-muted/30 rounded-md border border-border/50 p-2 text-xs font-mono">
                            <span className="text-muted-foreground mb-1 text-[10px] truncate" title={k}>{k}</span>
                            <span className="text-foreground/90 truncate" title={String(v as any)}>{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-Components */}
                  {children.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5"><Layers className="w-3 h-3" /> Sub-Components ({children.length})</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {children.map((ch: any) => (
                          <Badge key={ch.id} variant="secondary" className="cursor-pointer hover:bg-muted-foreground/20 font-normal text-[10px] flex items-center gap-1" onClick={() => setSelectedComp(ch)}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColor(ch.type) }} />
                            {ch.type}: {ch.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* HTML Source */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Boxes className="w-3 h-3" /> HTML Source</h3>
                      <CopyButton text={formattedHtml} />
                    </div>
                    <div className="bg-muted rounded-lg border border-border overflow-hidden">
                      <pre className="p-3 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap h-[180px] overflow-y-auto break-words leading-relaxed">
                        {formattedHtml}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Aside: Computed Styles */}
                <aside className="w-full lg:w-[280px] shrink-0 space-y-4 min-w-0">
                  <div>
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5"><Palette className="w-3 h-3" /> Computed Styles</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1.5">
                      {styleEntries.map(([k, v]) => (
                        <div key={k} className="bg-muted/30 rounded-md border border-border/50 px-2.5 py-2 text-[10px] font-mono min-w-0">
                          <div className="text-muted-foreground mb-0.5 break-all">{k}</div>
                          <div className="text-foreground/90 break-words leading-relaxed">{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}
