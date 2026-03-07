import { Palette, Layout, Info, Layers, Boxes } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { typeColor, formatHtml, copyToClipboard } from "@/lib/helpers"
import { MetricBox } from "@/components/shared"
import type { DesignSystemData } from "@/types/design-system"

interface ComponentDialogProps {
  selectedComp: any
  setSelectedComp: (comp: any) => void
  data: DesignSystemData
}

export function ComponentDialog({ selectedComp, setSelectedComp, data }: ComponentDialogProps) {
  if (!selectedComp) return null

  const children = selectedComp.children ? selectedComp.children.map((id: string) => data.components.find((c: any) => c.id === id)).filter(Boolean) : []
  const parent = selectedComp.parentId ? data.components.find((c: any) => c.id === selectedComp.parentId) : null
  const pattern = selectedComp.patternId ? (data.patterns || []).find((p: any) => p.id === selectedComp.patternId) : null
  const styleEntries = Object.entries(selectedComp.styles || {}).filter(([_,v]) => v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== '')
  const hoverState = data.interactions?.hoverStates?.find((h: any) => h.componentId === selectedComp.id)

  return (
    <Dialog open={!!selectedComp} onOpenChange={(o) => !o && setSelectedComp(null)}>
        <DialogContent className="max-w-4xl sm:max-w-4xl max-h-[90vh] bg-background border-border text-foreground flex flex-col p-0 overflow-hidden">
          <>
            <DialogHeader className="p-6 pb-4 border-b border-border bg-background/80 backdrop-blur shrink-0">
              <div className="flex items-center gap-3 mb-1">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: typeColor(selectedComp.type) }} />
                <DialogTitle className="text-xl leading-tight pr-10">
                  <span className="text-muted-foreground font-normal">{selectedComp.type}/{selectedComp.subType}:</span>{" "}
                  <span className="break-words">{selectedComp.name}</span>
                </DialogTitle>
              </div>
            </DialogHeader>
            <ScrollArea className="flex-1">
              <div className="p-6">
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="flex-1 space-y-6 min-w-0">
                    {selectedComp.screenshot && (
                      <div className="bg-card rounded-xl p-8 border border-border flex items-center justify-center relative overflow-hidden ring-1 ring-inset ring-foreground/5 shadow-inner">
                        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjMWExYTFhIj48L3JlY3Q+CjxwYXRoIGQ9Ik0wIDBMOCA4Wk04IDBMMCA4WiIgc3Ryb2tlPSIjMjI0IiBzdHJva2Utd2lkdGg9IjEiPjwvcGF0aD4KPC9zdmc+')] opacity-20 mix-blend-overlay"></div>
                        <img src={`/output/${selectedComp.screenshot}`} alt={selectedComp.name} className="max-w-full max-h-[300px] object-contain relative z-10 drop-shadow-lg" />
                      </div>
                    )}

                    {hoverState && (
                      <div>
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Palette className="w-3.5 h-3.5" /> Hover State</h3>
                        <div className="bg-card border border-border rounded-md p-4">
                          <div className="flex flex-col sm:flex-row gap-4 border-b border-border pb-4 mb-4">
                            <div className="flex-1 text-center bg-muted/30 p-4 rounded-md">
                              <div className="text-[10px] text-muted-foreground font-semibold tracking-wider mb-2">DEFAULT</div>
                              {selectedComp.screenshot && <img src={`/output/${selectedComp.screenshot}`} className="max-h-[100px] object-contain mx-auto" />}
                            </div>
                            <div className="flex-1 text-center bg-muted/30 p-4 rounded-md">
                              <div className="text-[10px] text-muted-foreground font-semibold tracking-wider mb-2">HOVER</div>
                              {hoverState.screenshotHover && <img src={`/output/${hoverState.screenshotHover}`} className="max-h-[100px] object-contain mx-auto" />}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                            {Object.entries(hoverState.changes).map(([k, v]: [string, any]) => (
                              <div key={k} className="flex gap-2 text-xs font-mono">
                                <span className="text-muted-foreground min-w-[120px]">{k}</span>
                                <span className="text-red-400 truncate flex-1" title={v.from}>{v.from}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="text-green-500 truncate flex-1" title={v.to}>{v.to}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Layout className="w-3.5 h-3.5" /> Metrics</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <MetricBox label="Width" value={`${Math.round(selectedComp.rect.width)}px`} />
                        <MetricBox label="Height" value={`${Math.round(selectedComp.rect.height)}px`} />
                        <MetricBox label="X Pos" value={Math.round(selectedComp.rect.x)} />
                        <MetricBox label="Y Pos" value={Math.round(selectedComp.rect.y)} />
                      </div>
                    </div>

                    {(parent || pattern || Object.keys(selectedComp.dataAttributes || {}).length > 0) && (
                      <div>
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Info className="w-3.5 h-3.5" /> Info & Attributes</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {parent && (
                            <div className="flex flex-col bg-muted/30 rounded-md border border-border/50 p-2 text-xs font-mono">
                              <span className="text-muted-foreground mb-1">Parent</span>
                              <span className="text-primary cursor-pointer hover:underline truncate" onClick={() => setSelectedComp(parent)} title={`${parent.type}: ${parent.name}`}>{parent.type}: {parent.name}</span>
                            </div>
                          )}
                          {pattern && (
                            <div className="flex flex-col bg-muted/30 rounded-md border border-border/50 p-2 text-xs font-mono">
                              <span className="text-muted-foreground mb-1">Pattern</span>
                              <span className="text-[#f59e0b] truncate" title={`${pattern.name} (${pattern.instanceCount}×)`}>{pattern.name} ({pattern.instanceCount}×)</span>
                            </div>
                          )}
                          {Object.entries(selectedComp.dataAttributes || {}).map(([k, v]) => (
                            <div key={k} className="flex flex-col bg-muted/30 rounded-md border border-border/50 p-2 text-xs font-mono">
                              <span className="text-muted-foreground mb-1 truncate" title={k}>{k}</span>
                              <span className="text-foreground/90 truncate" title={String(v as any)}>{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {children.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> Sub-Components ({children.length})</h3>
                        <div className="flex flex-wrap gap-2">
                          {children.map((ch: any) => (
                            <Badge key={ch.id} variant="secondary" className="cursor-pointer hover:bg-muted-foreground/20 font-normal text-xs flex items-center gap-1.5" onClick={() => setSelectedComp(ch)}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColor(ch.type) }} />
                              {ch.type}: {ch.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Boxes className="w-3.5 h-3.5" /> HTML Source</h3>
                      <div className="bg-muted rounded-lg border border-border overflow-x-auto relative group">
                        <button 
                          onClick={() => copyToClipboard(formatHtml(selectedComp.html))}
                          className="absolute right-4 top-4 text-xs bg-background hover:bg-background/80 text-foreground px-3 py-1.5 rounded-md font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Copy
                        </button>
                        <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-[340px] overflow-y-auto break-words">
                          {formatHtml(selectedComp.html)}
                        </pre>
                      </div>
                    </div>
                  </div>

                  <aside className="w-full lg:w-[320px] shrink-0 space-y-6 min-w-0">
                    <div>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Palette className="w-3.5 h-3.5" /> Computed Styles</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                        {styleEntries.map(([k, v]) => (
                          <div key={k} className="bg-muted/30 rounded-md border border-border/50 p-3 text-xs font-mono min-w-0">
                            <div className="text-muted-foreground mb-1 break-all">{k}</div>
                            <div className="text-foreground/90 break-words whitespace-pre-wrap leading-relaxed">{String(v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            </ScrollArea>
          </>
        </DialogContent>
    </Dialog>
  )
}
