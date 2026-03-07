import React, { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { typeColor } from "@/lib/helpers"

export function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-3 py-1.5">{title}</h3>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  )
}

export function NavItem({ id, icon, label, count, active, onClick }: { id: string; icon: React.ReactNode; label: string; count?: number; active: string; onClick: (id: string) => void }) {
  const isActive = active === id
  return (
    <button
      onClick={() => onClick(id)}
      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-all duration-200 ${
        isActive 
          ? "bg-primary/10 text-primary font-medium shadow-[inset_2px_0_0_0_hsl(var(--primary))]" 
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4 ${isActive ? "opacity-100" : "opacity-70"}`}>
          {icon}
        </div>
        <span>{label}</span>
      </div>
      {count !== undefined && (
        <Badge variant="secondary" className={`px-1.5 min-w-5 h-5 flex items-center justify-center text-[10px] rounded-full border-none ${isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
          {count}
        </Badge>
      )}
    </button>
  )
}

export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="bg-muted/30 border-border p-4 hover:bg-muted/50 transition-colors shadow-none">
      <div className="text-3xl font-bold text-primary mb-1">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
    </Card>
  )
}

export function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

export function MetricBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/80 rounded-lg border border-border p-3 min-h-[88px] flex flex-col items-center justify-center text-center">
      <span className="text-[10px] uppercase text-muted-foreground font-bold mb-1 tracking-wider">{label}</span>
      <span className="font-mono text-sm text-foreground">{value}</span>
    </div>
  )
}

export function TreeNode({ comp, allComps, depth, onOpen }: { comp: any; allComps: any[]; depth: number; onOpen: (c: any) => void }) {
  const [expanded, setExpanded] = useState(true);
  const children = allComps.filter(c => c.parentId === comp.id);
  const hasKids = children.length > 0;
  const color = typeColor(comp.type);

  return (
    <div className="relative">
      <div 
        className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 cursor-pointer group"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <div 
          className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {hasKids ? (expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : <span className="w-1 h-1 rounded-full bg-border" />}
        </div>
        
        <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => onOpen(comp)}>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[10px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider shrink-0" style={{ backgroundColor: `${color}20`, color }}>
            {comp.type}{comp.subType !== comp.type ? `/${comp.subType}` : ''}
          </span>
          <span className="text-foreground/80 truncate group-hover:text-foreground transition-colors">{comp.name}</span>
          <span className="text-muted-foreground ml-auto shrink-0">{comp.rect.width}×{comp.rect.height}</span>
        </div>
      </div>
      {hasKids && expanded && (
        <div>
          {children.map(c => <TreeNode key={c.id} comp={c} allComps={allComps} depth={depth + 1} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  )
}
