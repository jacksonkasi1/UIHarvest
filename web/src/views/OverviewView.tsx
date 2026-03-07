import type { DesignSystemData } from "@/types/design-system"
import { StatCard } from "@/components/shared"

export function OverviewView({ data, uniqueVariants }: { data: DesignSystemData, uniqueVariants: number }) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">{data.meta.title}</h1>
        <p className="text-muted-foreground font-mono text-xs flex items-center gap-3">
          <a href={data.meta.url} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">{data.meta.url}</a>
          <span>•</span>
          <span>{data.meta.viewport.width} × {data.meta.fullHeight}px</span>
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Colors" value={data.tokens.colors.length} />
        <StatCard label="Gradients" value={data.tokens.gradients?.length || 0} />
        <StatCard label="Typography" value={data.tokens.typography.length} />
        <StatCard label="Spacing" value={data.tokens.spacing.length} />
        <StatCard label="Radii" value={data.tokens.radii.length} />
        <StatCard label="Shadows" value={data.tokens.shadows.length} />
        <StatCard label="Borders" value={data.tokens.borders?.length || 0} />
        <StatCard label="Transitions" value={data.tokens.transitions?.length || 0} />
        <StatCard label="Components" value={data.components.length} />
        <StatCard label="Variants" value={uniqueVariants} />
        <StatCard label="Patterns" value={data.patterns?.length || 0} />
        <StatCard label="Hover States" value={data.interactions?.hoverStates?.length || 0} />
        <StatCard label="Sections" value={data.sections.length} />
        <StatCard label="Assets" value={data.assets.images.length + data.assets.svgs.length} />
        <StatCard label="CSS Vars" value={data.cssVariables?.length || 0} />
        <StatCard label="Font Faces" value={data.fontFaces?.length || 0} />
      </div>

      {data.fullPageScreenshot && (
        <div className="space-y-3 pt-6 border-t border-border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Full Page Capture</h2>
          <div className="rounded-xl border border-border overflow-hidden bg-muted ring-1 ring-foreground/5 shadow-sm">
            <img src={`/output/${data.fullPageScreenshot}`} alt="Full Page" loading="lazy" className="w-full h-auto object-cover" />
          </div>
        </div>
      )}
    </div>
  )
}
