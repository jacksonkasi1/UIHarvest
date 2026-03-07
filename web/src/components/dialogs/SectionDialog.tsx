import { Layout, Info, Layers, Type } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { typeColor } from "@/lib/helpers"
import { MetricBox } from "@/components/shared"
import type { DesignSystemData } from "@/types/design-system"

interface SectionDialogProps {
  selectedSection: any
  setSelectedSection: (sec: any) => void
  data: DesignSystemData
  setSelectedComp: (comp: any) => void
}

export function SectionDialog({ selectedSection, setSelectedSection, data, setSelectedComp }: SectionDialogProps) {
  if (!selectedSection) return null

  const compsInSection = (selectedSection.childComponentIds || []).map((id: string) => data.components.find((c: any) => c.id === id)).filter(Boolean)
  const byType: { [key: string]: any[] } = {}
  compsInSection.forEach((c: any) => {
    if (!byType[c.type]) byType[c.type] = []
    byType[c.type].push(c)
  })

  return (
    <Dialog open={!!selectedSection} onOpenChange={(o) => !o && setSelectedSection(null)}>
      <DialogContent className="max-w-4xl sm:max-w-4xl max-h-[90vh] bg-background border-border text-foreground flex flex-col p-0 overflow-hidden">
        <>
          <DialogHeader className="p-6 pb-4 border-b border-border bg-background/80 backdrop-blur shrink-0">
            <div className="flex items-center gap-3 mb-1">
              <Badge variant="outline" className="border-border text-muted-foreground font-mono text-xs px-2 py-0">&lt;{selectedSection.tag}&gt;</Badge>
              <DialogTitle className="text-xl leading-tight pr-10 break-words">{selectedSection.name}</DialogTitle>
            </div>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <div className="p-6">
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 space-y-6 min-w-0">
                  {selectedSection.screenshot && (
                    <div className="rounded-xl border border-border overflow-hidden ring-1 ring-foreground/5 shadow-lg max-h-[500px] bg-card overflow-y-auto">
                      <img src={`/output/${selectedSection.screenshot}`} alt={selectedSection.name} className="w-full h-auto object-cover object-top" />
                    </div>
                  )}

                  <div>
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Layout className="w-3.5 h-3.5" /> Metrics</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <MetricBox label="Width" value={`${Math.round(selectedSection.rect.width)}px`} />
                      <MetricBox label="Height" value={`${Math.round(selectedSection.rect.height)}px`} />
                      <MetricBox label="X Pos" value={Math.round(selectedSection.rect.x)} />
                      <MetricBox label="Y Pos" value={Math.round(selectedSection.rect.y)} />
                    </div>
                  </div>

                  {Object.keys(selectedSection.dataAttributes || {}).length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Info className="w-3.5 h-3.5" /> Attributes</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {Object.entries(selectedSection.dataAttributes || {}).map(([k, v]) => (
                          <div key={k} className="flex flex-col bg-muted/30 rounded-md border border-border/50 p-2 text-xs font-mono">
                            <span className="text-muted-foreground mb-1 truncate" title={k}>{k}</span>
                            <span className="text-foreground/90 truncate" title={String(v as any)}>{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {compsInSection.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> Components Inside ({compsInSection.length})</h3>
                      <div className="space-y-4">
                        {Object.entries(byType).map(([type, comps]) => (
                          <div key={type}>
                            <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: typeColor(type) }}>{type} ({comps.length})</div>
                            <div className="flex flex-wrap gap-2">
                              {comps.map(c => (
                                <Badge key={c.id} variant="secondary" className="cursor-pointer hover:bg-muted-foreground/20 font-normal text-xs flex items-center gap-1.5" onClick={() => setSelectedComp(c)}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColor(c.type) }} />
                                  {c.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <aside className="w-full lg:w-[320px] shrink-0 space-y-6 min-w-0">
                  <div>
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Type className="w-3.5 h-3.5" /> Text Content Preview</h3>
                    <div className="p-4 bg-muted/50 rounded-md border border-border/50 text-sm text-muted-foreground leading-relaxed italic border-l-2 border-l-primary">
                      {selectedSection.textPreview ? `"${selectedSection.textPreview}"` : "No text content found."}
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
