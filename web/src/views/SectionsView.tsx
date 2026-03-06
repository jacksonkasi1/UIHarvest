import type { DesignSystemData } from "@/types/design-system"
import { Header } from "@/components/shared"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function SectionsView({ data, setSelectedSection }: { data: DesignSystemData, setSelectedSection: (sec: any) => void }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header title="Page Sections" subtitle={`${data.sections.length} layout sections identified`} />
      <div className="flex flex-col gap-6">
        {data.sections.map((sec, i) => (
          <Card key={i} className="bg-card border-border overflow-hidden cursor-pointer hover:border-indigo-500/50 transition-colors group" onClick={() => setSelectedSection(sec)}>
            {sec.screenshot && (
              <div className="border-b border-border max-h-[400px] overflow-hidden bg-muted flex items-start">
                <img src={`/output/${sec.screenshot}`} alt={sec.name} className="w-full h-auto object-cover object-top opacity-90 group-hover:opacity-100 transition-opacity" loading="lazy" />
              </div>
            )}
            <div className="p-4 flex items-center justify-between gap-4">
              <h3 className="font-semibold text-foreground truncate flex-1">{sec.name}</h3>
              <div className="flex items-center gap-3 shrink-0">
                {sec.childComponentIds && sec.childComponentIds.length > 0 && (
                  <span className="text-[10px] text-muted-foreground mr-2">{sec.childComponentIds.length} components</span>
                )}
                <Badge variant="secondary" className="bg-muted text-foreground font-mono text-xs">&lt;{sec.tag}&gt;</Badge>
                <span className="font-mono text-xs text-muted-foreground">{sec.rect.width}×{sec.rect.height}px</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
