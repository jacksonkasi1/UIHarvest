import type { DesignSystemData } from "@/types/design-system"
import { Header } from "@/components/shared"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatHtml, copyToClipboard } from "@/lib/helpers"

export function PatternsView({ data, setSelectedComp }: { data: DesignSystemData, setSelectedComp: (comp: any) => void }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header title="Repeated Patterns" subtitle={`${(data.patterns || []).length} patterns detected — groups of elements with identical structure`} />
      <div className="flex flex-col gap-6">
        {(data.patterns || []).map((p, i) => (
          <Card key={i} className="bg-card border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="font-semibold text-foreground">{p.name}</h3>
              <Badge className="bg-primary/10 text-primary hover:bg-primary/20">{p.instanceCount} instances</Badge>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Structure</h4>
                <div className="bg-muted rounded-md p-3 overflow-x-auto text-xs font-mono text-muted-foreground">
                  {p.structure}
                </div>
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Instances</h4>
                <div className="flex flex-wrap gap-2">
                  {p.componentIds.map(id => {
                    const comp = data.components.find(c => c.id === id)
                    if (!comp) return null;
                    return (
                      <Badge key={id} variant="secondary" className="cursor-pointer hover:bg-primary/20 hover:text-primary transition-colors font-normal text-xs" onClick={() => setSelectedComp(comp)}>
                        {comp.name}
                      </Badge>
                    )
                  })}
                </div>
              </div>
              {p.templateHtml && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Template</h4>
                    <button onClick={() => copyToClipboard(p.templateHtml!)} className="text-[10px] text-primary hover:underline">Copy HTML</button>
                  </div>
                  <div className="bg-muted rounded-md p-3 overflow-x-auto text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                    {formatHtml(p.templateHtml)}
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
