import type { DesignSystemData } from "@/types/design-system"
import { Header } from "@/components/shared"
import { Card } from "@/components/ui/card"
import { copyToClipboard } from "@/lib/helpers"

export function ColorsView({ data }: { data: DesignSystemData }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header title="Colors" subtitle={`${data.tokens.colors.length} unique colors extracted`} />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {data.tokens.colors.map((c, i) => (
          <Card key={i} className="bg-card border-border overflow-hidden cursor-pointer hover:border-indigo-500/50 transition-colors group" onClick={() => copyToClipboard(c.hex)}>
            <div className="h-16 w-full" style={{ backgroundColor: c.hex }} />
            <div className="p-3">
              <div className="font-mono text-xs font-semibold text-card-foreground group-hover:text-indigo-500 transition-colors">{c.hex}</div>
              <div className="text-[10px] text-muted-foreground mt-1 truncate" title={c.usages.join(', ')}>{c.usages.join(', ')}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">×{c.count}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
