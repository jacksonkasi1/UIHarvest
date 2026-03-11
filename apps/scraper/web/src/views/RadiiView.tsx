import type { DesignSystemData } from "@/types/design-system"
import { Header } from "@/components/shared"

export function RadiiView({ data }: { data: DesignSystemData }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header title="Border Radii" subtitle={`${data.tokens.radii.length} unique values detected`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-6">
        {data.tokens.radii.map((r, i) => (
          <div key={i} className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 border-2 border-primary bg-card" style={{ borderRadius: r.value }} />
            <div className="text-center">
              <div className="font-mono text-xs text-foreground">{r.value}</div>
              <div className="text-[10px] text-muted-foreground">×{r.count}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
