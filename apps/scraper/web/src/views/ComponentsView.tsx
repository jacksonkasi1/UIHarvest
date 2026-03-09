import type { DesignSystemData } from "@/types/design-system"
import { Header } from "@/components/shared"
import { Card } from "@/components/ui/card"
import { typeColor } from "@/lib/helpers"
import { useOutputUrl } from "@/lib/output-base"

const formatComponentName = (name: string) => {
  if (!name) return "Unnamed Component"
  if (name.includes('<')) {
    const altMatch = name.match(/alt=["']([^"']+)["']/i)
    if (altMatch && altMatch[1]) return altMatch[1]
    const ariaMatch = name.match(/aria-label=["']([^"']+)["']/i)
    if (ariaMatch && ariaMatch[1]) return ariaMatch[1]
    const textMatch = name.replace(/<[^>]*>?/gm, '').trim()
    if (textMatch) return textMatch
    const tagMatch = name.match(/<([a-z0-9-]+)/i)
    if (tagMatch && tagMatch[1]) return `<${tagMatch[1]}> element`
    return "UI Element"
  }
  return name
}

export function ComponentsView({
  data,
  activeTab,
  activeSubFilter,
  setActiveSubFilter,
  setSelectedComp
}: {
  data: DesignSystemData,
  activeTab: string,
  activeSubFilter: string,
  setActiveSubFilter: (filter: string) => void,
  setSelectedComp: (comp: any) => void
}) {
  const type = activeTab.replace("comp-", "")
  const outputUrl = useOutputUrl()
  const all = data.components.filter((c) => c.type === type)
  const subTypes = all.reduce((acc, c) => { acc[c.subType] = (acc[c.subType] || 0) + 1; return acc }, {} as { [key: string]: number })
  const filtered = activeSubFilter === "all" ? all : all.filter(c => c.subType === activeSubFilter)

  const groups: { [key: string]: any[] } = {}
  filtered.forEach(c => {
    if (!groups[c.signature]) groups[c.signature] = []
    groups[c.signature].push(c)
  })
  const variants = Object.values(groups).map(g => {
    const withScreenshot = g.find((item) => !!item.screenshot)
    const representative = withScreenshot || g[0]
    return { ...representative, count: g.length }
  })
  const visibleVariants = variants.filter(v => !!v.screenshot)
  const hiddenNoShot = variants.length - visibleVariants.length

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header title={`${type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ')}s`} subtitle={`${all.length} total • ${variants.length} unique variants`} />

      {Object.keys(subTypes).length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${activeSubFilter === 'all' ? 'bg-primary/10 border-primary text-primary font-medium' : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/50'}`}
            onClick={() => setActiveSubFilter("all")}
          >
            All ({all.length})
          </button>
          {Object.entries(subTypes).map(([st, c]) => (
            <button
              key={st}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${activeSubFilter === st ? 'bg-primary/10 border-primary text-primary font-medium' : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/50'}`}
              onClick={() => setActiveSubFilter(st)}
            >
              {st} ({c})
            </button>
          ))}
        </div>
      )}

      {hiddenNoShot > 0 && (
        <div className="text-xs text-muted-foreground">{hiddenNoShot} variants hidden (no screenshot)</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {visibleVariants.map((c, i) => (
          <Card key={i} className="bg-card border-border overflow-hidden cursor-pointer hover:border-primary/50 transition-all duration-300 group flex flex-col" onClick={() => setSelectedComp(c)}>
            <div className="bg-muted/30 flex items-center justify-center p-4 min-h-[160px] flex-1 border-b border-border relative overflow-hidden">
              <img src={outputUrl(c.screenshot)} alt={c.name} className="max-w-full max-h-[220px] object-contain drop-shadow-sm group-hover:scale-105 transition-transform duration-500" loading="lazy" />
            </div>
            <div className="p-3 flex flex-col bg-card/50">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColor(c.type) }} />
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">{c.subType}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {c.patternId && <span className="text-[9px] bg-[#f59e0b]/10 text-[#f59e0b] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider">Pattern</span>}
                  {c.count > 1 && <span className="text-[10px] font-medium text-muted-foreground">×{c.count}</span>}
                </div>
              </div>
              <h3 className="text-sm font-semibold text-foreground truncate" title={c.name}>
                {formatComponentName(c.name)}
              </h3>
              <div className="flex items-center justify-between mt-1">
                <div className="font-mono text-[10px] text-muted-foreground/70">{c.rect.width}×{c.rect.height}px</div>
                {c.children && c.children.length > 0 && (
                  <div className="text-[10px] text-muted-foreground/70">↳ {c.children.length} sub</div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
