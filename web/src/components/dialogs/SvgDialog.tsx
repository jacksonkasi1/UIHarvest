import { Boxes } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MetricBox } from "@/components/shared"
import { formatHtml, copyToClipboard } from "@/lib/helpers"

interface SvgDialogProps {
  selectedSvg: any
  setSelectedSvg: (svg: any) => void
}

export function SvgDialog({ selectedSvg, setSelectedSvg }: SvgDialogProps) {
  if (!selectedSvg) return null

  return (
    <Dialog open={!!selectedSvg} onOpenChange={(o) => !o && setSelectedSvg(null)}>
      <DialogContent className="max-w-2xl bg-background border-border text-foreground flex flex-col p-0 overflow-hidden">
        <>
          <DialogHeader className="p-6 pb-4 border-b border-border bg-background/80 backdrop-blur shrink-0">
            <DialogTitle className="text-xl">{selectedSvg.title || `SVG #${selectedSvg.idx + 1}`}</DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-6">
            <div className="bg-card rounded-xl p-8 border border-border flex items-center justify-center text-foreground shadow-inner min-h-[160px]">
              <div className="w-16 h-16 [&>svg]:w-full [&>svg]:h-full drop-shadow-lg" dangerouslySetInnerHTML={{ __html: selectedSvg.html }} />
            </div>
            
            <div className="flex gap-4">
              <MetricBox label="Width" value={`${Math.round(selectedSvg.width)}px`} />
              <MetricBox label="Height" value={`${Math.round(selectedSvg.height)}px`} />
              <MetricBox label="ViewBox" value={selectedSvg.viewBox || "—"} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Boxes className="w-3.5 h-3.5" /> Raw SVG</h3>
                <button 
                  onClick={() => copyToClipboard(selectedSvg.html)}
                  className="text-xs text-indigo-500 hover:text-indigo-400 font-medium bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-md transition-colors"
                >
                  Copy SVG Code
                </button>
              </div>
              <div className="bg-muted rounded-lg border border-border overflow-x-auto">
                <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                  {formatHtml(selectedSvg.html)}
                </pre>
              </div>
            </div>
          </div>
        </>
      </DialogContent>
    </Dialog>
  )
}
