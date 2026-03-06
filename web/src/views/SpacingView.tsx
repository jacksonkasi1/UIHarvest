import type { DesignSystemData } from "@/types/design-system"
import { Header } from "@/components/shared"

export function SpacingView({ data }: { data: DesignSystemData }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header title="Spacing Scale" subtitle={`${data.tokens.spacing.length} unique values detected`} />
      <div className="flex flex-col gap-2 max-w-3xl">
        {data.tokens.spacing.map((v, i) => {
          const max = Math.max(...data.tokens.spacing, 1)
          const width = Math.max((v / max) * 100, 1)
          return (
            <div key={i} className="flex items-center gap-4">
              <div className="font-mono text-xs text-muted-foreground w-12 text-right">{v}px</div>
              <div className="h-5 bg-indigo-500/80 rounded-sm min-w-[4px]" style={{ width: `${width}%` }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
