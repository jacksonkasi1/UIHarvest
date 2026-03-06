import type { DesignSystemData } from "@/types/design-system"
import { Header } from "@/components/shared"
import { Card } from "@/components/ui/card"

export function ShadowsView({ data }: { data: DesignSystemData }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header title="Box Shadows" subtitle={`${data.tokens.shadows.length} unique shadows`} />
      <div className="flex flex-col gap-4">
        {data.tokens.shadows.map((sh, i) => (
          <Card key={i} className="bg-muted/30 border-border p-6 flex flex-col md:flex-row items-center gap-8">
            <div className="w-24 h-16 bg-background rounded-md shrink-0 border border-border" style={{ boxShadow: sh.value }} />
            <div className="flex-1 font-mono text-xs text-muted-foreground break-all bg-muted p-3 rounded border border-border">
              {sh.value}
            </div>
            <div className="text-xs text-muted-foreground shrink-0 font-mono">
              ×{sh.count}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
