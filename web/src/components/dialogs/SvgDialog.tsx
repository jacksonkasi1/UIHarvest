import { useState } from "react"
import { Copy, Check, FileCode2, Maximize } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { formatHtml, copyToClipboard } from "@/lib/helpers"

interface SvgDialogProps {
  selectedSvg: any
  setSelectedSvg: (svg: any) => void
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
      className="p-1 rounded bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
      title="Copy SVG Code"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// Figma-style Property Row
function PropertyRow({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 hover:bg-muted/30 transition-colors">
      <span className="text-[10px] font-medium text-muted-foreground select-none">{label}</span>
      <span className="text-[11px] font-mono text-foreground/90 select-all text-right">{value}</span>
    </div>
  )
}

export function SvgDialog({ selectedSvg, setSelectedSvg }: SvgDialogProps) {
  if (!selectedSvg) return null

  const formattedHtml = formatHtml(selectedSvg.html)

  return (
    <Dialog open={!!selectedSvg} onOpenChange={(o) => !o && setSelectedSvg(null)}>
      {/* Reduced max-width and ultra-tight shadow/border */}
      <DialogContent className="min-w-4xl w-[90vw] h-[75vh] bg-background border border-border/80 text-foreground flex flex-col p-0 overflow-hidden shadow-2xl rounded-md gap-0">

        {/* DEVTOOLS STYLE HEADER: Ultra thin, minimal padding */}
        <DialogHeader className="px-3 py-2 border-b border-border bg-muted/10 shrink-0 flex flex-row justify-between items-center h-9">
          <DialogTitle className="text-[12px] font-medium leading-tight truncate flex items-center gap-2 text-foreground/80">
            <FileCode2 className="w-3.5 h-3.5 text-muted-foreground" />
            {selectedSvg.title || `SVG Asset #${selectedSvg.idx + 1}`}
          </DialogTitle>
        </DialogHeader>

        {/* PRO-TOOL SPLIT LAYOUT */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden bg-background">

          {/* LEFT PANEL: Canvas & Code */}
          <div className="flex flex-col flex-1 border-r border-border min-w-0">

            {/* CANVAS AREA (with Figma-style dot grid background) */}
            <div className="relative h-[200px] shrink-0 border-b border-border flex items-center justify-center overflow-hidden bg-[#f8f9fa] dark:bg-[#0a0a0a]"
              style={{ backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)', backgroundSize: '12px 12px' }}>

              <div className="absolute top-2 left-2 px-2 py-0.5 bg-background/80 backdrop-blur-sm border border-border/50 rounded text-[9px] font-mono text-muted-foreground uppercase tracking-wider select-none">
                Preview
              </div>

              <div
                className="w-24 h-24 [&>svg]:w-full [&>svg]:h-full text-foreground drop-shadow-md transition-transform hover:scale-110 duration-200"
                dangerouslySetInnerHTML={{ __html: selectedSvg.html }}
              />
            </div>

            {/* CODE AREA */}
            <div className="flex flex-col flex-1 min-h-0 bg-[#0D1117]">
              {/* Code Toolbar */}
              <div className="flex justify-between items-center px-3 py-1.5 border-b border-border/20 bg-black/20 shrink-0">
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider select-none">Source Code</span>
                <CopyButton text={selectedSvg.html} />
              </div>

              {/* Scrollable Code (No internal padding gaps) */}
              <ScrollArea className="flex-1 w-full">
                <pre className="p-3 text-[11px] font-mono text-gray-300 whitespace-pre w-max min-w-full leading-[1.6]">
                  {formattedHtml}
                </pre>
                <ScrollBar orientation="horizontal" className="h-2" />
                <ScrollBar orientation="vertical" className="w-2" />
              </ScrollArea>
            </div>

          </div>

          {/* RIGHT PANEL: Properties Inspector (Fixed Width) */}
          <div className="w-full md:w-[240px] shrink-0 bg-muted/5 flex flex-col h-full overflow-y-auto">

            <div className="px-3 py-2 border-b border-border/60 bg-muted/10 shrink-0 sticky top-0 z-10">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 select-none">
                <Maximize className="w-3 h-3" /> Layout Properties
              </h3>
            </div>

            <div className="flex flex-col divide-y divide-border/40 pb-4">
              <PropertyRow label="Width" value={`${Math.round(selectedSvg.width)}px`} />
              <PropertyRow label="Height" value={`${Math.round(selectedSvg.height)}px`} />
              <PropertyRow label="ViewBox" value={selectedSvg.viewBox || "auto"} />
              <PropertyRow label="Instances" value={selectedSvg.reuseCount} />
              <PropertyRow label="Element" value="<svg>" />
              <PropertyRow label="Type" value="Vector Graphic" />
            </div>

          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}