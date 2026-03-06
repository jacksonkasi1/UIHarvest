import type { DesignSystemData } from "@/types/design-system"
import { Header } from "@/components/shared"
import { Card } from "@/components/ui/card"

export function SvgsView({ data, setSelectedSvg }: { data: DesignSystemData, setSelectedSvg: (svg: any) => void }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header title="SVGs & Icons" subtitle={`${data.assets.svgs.length} inline SVGs extracted`} />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-4">
        {data.assets.svgs.map((svg, i) => (
          <Card key={i} className="bg-card border-border overflow-hidden cursor-pointer hover:border-indigo-500/50 transition-colors" onClick={() => setSelectedSvg({ ...svg, idx: i })}>
            <div className="h-24 bg-muted/50 flex items-center justify-center p-4 border-b border-border text-foreground">
              <div className="max-w-[48px] max-h-[48px] flex items-center justify-center [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg.html }} />
            </div>
            <div className="p-3 font-mono text-[10px] text-muted-foreground flex flex-col gap-1 text-center">
              <span className="truncate text-foreground" title={svg.title}>{svg.title || "—"}</span>
              <span>{Math.round(svg.width)}×{Math.round(svg.height)}px</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
