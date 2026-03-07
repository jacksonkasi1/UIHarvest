import type { DesignSystemData } from "@/types/design-system"
import { Header } from "@/components/shared"
import { Card } from "@/components/ui/card"
import { typeColor } from "@/lib/helpers"

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
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${activeSubFilter === 'all' ? 'bg-indigo-500/10 border-indigo-500 text-indigo-500 font-medium' : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/50'}`}
            onClick={() => setActiveSubFilter("all")}
          >
            All ({all.length})
          </button>
          {Object.entries(subTypes).map(([st, c]) => (
            <button 
              key={st}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${activeSubFilter === st ? 'bg-indigo-500/10 border-indigo-500 text-indigo-500 font-medium' : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/50'}`}
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
          <Card key={i} className="bg-card border-border overflow-hidden cursor-pointer hover:border-indigo-500/50 transition-colors group flex flex-col" onClick={() => setSelectedComp(c)}>
            <div className="bg-muted/50 flex items-center justify-center p-6 min-h-[120px] max-h-[240px] border-b border-border relative">
              <img src={`/output/${c.screenshot}`} alt={c.name} className="max-w-full max-h-[200px] object-contain drop-shadow-md" loading="lazy" />
            </div>
            <div className="p-4 flex flex-col flex-1">
              <div className="flex items-start gap-2 mb-2 flex-wrap">
                <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: typeColor(c.type) }} />
                <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: typeColor(c.type) }}>{c.subType}</span>
                {c.count > 1 && <span className="text-[10px] text-muted-foreground ml-auto">×{c.count}</span>}
                {c.patternId && <span className="text-[9px] bg-[#f59e0b]/20 text-[#f59e0b] px-1.5 rounded-sm font-bold uppercase ml-2 tracking-wider">Pattern</span>}
              </div>
              <h3 className="text-sm font-medium text-foreground line-clamp-2">{c.name}</h3>
              <div className="font-mono text-[10px] text-muted-foreground mt-2">{c.rect.width}×{c.rect.height}px</div>
              {c.children && c.children.length > 0 && (
                <div className="text-[10px] text-muted-foreground mt-1">↳ {c.children.length} sub-component{c.children.length > 1 ? 's' : ''}</div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
