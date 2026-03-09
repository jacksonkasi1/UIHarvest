import { useState } from "react"
import { Layout, Info, Layers, Type, Maximize2, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { typeColor } from "@/lib/helpers"
import { MetricBox } from "@/components/shared"
import { useOutputUrl } from "@/lib/output-base"
import type { DesignSystemData } from "@/types/design-system"

interface SectionDialogProps {
  selectedSection: any
  setSelectedSection: (sec: any) => void
  data: DesignSystemData
  setSelectedComp: (comp: any) => void
}

function SectionHeading({ icon: Icon, title }: { icon: any, title: string }) {
  return (
    <div className="flex items-center justify-between mb-3 mt-6 first:mt-0">
      <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h3>
    </div>
  )
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

export function SectionDialog({ selectedSection, setSelectedSection, data, setSelectedComp }: SectionDialogProps) {
  const [zoomOpen, setZoomOpen] = useState(false)
  const outputUrl = useOutputUrl()

  if (!selectedSection) return null

  const compsInSection = (selectedSection.childComponentIds || []).map((id: string) => data.components.find((c: any) => c.id === id)).filter(Boolean)
  const byType: { [key: string]: any[] } = {}
  compsInSection.forEach((c: any) => {
    if (!byType[c.type]) byType[c.type] = []
    byType[c.type].push(c)
  })

  return (
    <>
      {zoomOpen && (
        <ImageZoomModal
          src={outputUrl(selectedSection.screenshot)}
          alt={selectedSection.name}
          onClose={() => setZoomOpen(false)}
        />
      )}
      <Dialog open={!!selectedSection} onOpenChange={(o) => !o && setSelectedSection(null)}>
        <DialogContent className="min-w-6xl w-[95vw] h-[85vh] bg-background border-border text-foreground flex flex-col p-0 overflow-hidden shadow-2xl gap-0">

          {/* HEADER */}
          <DialogHeader className="px-5 py-3.5 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="border-border/60 bg-background text-muted-foreground font-mono text-[10px] px-2 py-0.5 shadow-sm uppercase tracking-wider">
                &lt;{selectedSection.tag}&gt;
              </Badge>
              <DialogTitle className="text-sm font-medium leading-tight pr-8 truncate">
                {selectedSection.name}
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* TWO-COLUMN SPLIT LAYOUT */}
          <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden bg-background">

            {/* LEFT COLUMN: Main Visuals & Components */}
            <ScrollArea className="flex-1 border-r border-border h-full">
              <div className="p-5 max-w-3xl">

                {/* Screenshot with Hover Expand */}
                {selectedSection.screenshot && (
                  <div className="mb-6 flex justify-center w-full bg-muted/10 border border-border/50 rounded-md p-2 max-h-[250px]">
                    <div className="relative group/img inline-flex w-full rounded border border-border/40 overflow-hidden bg-background shadow-sm justify-center items-start h-full">
                      <img
                        src={outputUrl(selectedSection.screenshot)}
                        alt={selectedSection.name}
                        className="max-w-full max-h-[230px] object-contain object-top relative z-10"
                      />
                      <button
                        onClick={() => setZoomOpen(true)}
                        className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 bg-background/20 backdrop-blur-[1px]"
                      >
                        <div className="bg-foreground/90 rounded-full p-2.5 shadow-xl transform transition-transform group-hover/img:scale-110">
                          <Maximize2 className="w-4 h-4 text-background" />
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Metrics */}
                <SectionHeading icon={Layout} title="Metrics" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
                  <MetricBox label="Width" value={`${Math.round(selectedSection.rect.width)}px`} />
                  <MetricBox label="Height" value={`${Math.round(selectedSection.rect.height)}px`} />
                  <MetricBox label="X Pos" value={Math.round(selectedSection.rect.x)} />
                  <MetricBox label="Y Pos" value={Math.round(selectedSection.rect.y)} />
                </div>

                {/* Attributes */}
                {Object.keys(selectedSection.dataAttributes || {}).length > 0 && (
                  <>
                    <SectionHeading icon={Info} title="Section Attributes" />
                    <div className="flex flex-wrap gap-2 mb-6">
                      {Object.entries(selectedSection.dataAttributes || {}).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2 bg-muted/20 rounded border border-border/60 px-2.5 py-1.5 text-[11px] font-mono">
                          <span className="text-muted-foreground">{k}:</span>
                          <span className="text-foreground/90 truncate max-w-[250px]">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Components Inside */}
                {compsInSection.length > 0 && (
                  <>
                    <SectionHeading icon={Layers} title={`Child Components (${compsInSection.length})`} />
                    <div className="space-y-4">
                      {Object.entries(byType).map(([type, comps]) => (
                        <div key={type} className="flex flex-col gap-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: typeColor(type) }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColor(type) }} />
                            {type} ({comps.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5 pl-3 border-l-2 border-border/30">
                            {comps.map(c => (
                              <Badge
                                key={c.id}
                                variant="secondary"
                                className="cursor-pointer font-normal text-[11px] px-2 py-0.5"
                                onClick={() => setSelectedComp(c)}
                              >
                                <span className="truncate max-w-[200px]">{c.name}</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

              </div>
            </ScrollArea>

            {/* RIGHT COLUMN: Text Preview */}
            <div className="w-full md:w-[300px] shrink-0 flex flex-col h-full bg-muted/5">
              <div className="px-4 py-3.5 border-b border-border/60 bg-muted/10 shrink-0">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5" /> Text Content
                </h3>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-4">
                  <div className="text-[12px] text-foreground/80 leading-relaxed font-mono whitespace-pre-wrap break-words">
                    {selectedSection.textPreview ? (
                      selectedSection.textPreview
                    ) : (
                      <span className="text-muted-foreground italic">No text content found in this section.</span>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>

          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}