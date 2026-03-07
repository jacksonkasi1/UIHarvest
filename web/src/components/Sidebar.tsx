import {
  Palette, Type, Ruler, Square, MoonStar, Image as ImageIcon,
  PenTool, Boxes, Activity, Box, LayoutTemplate,
  Sun, Moon, FolderTree, Repeat, Wrench, FileType,
  MousePointerClick, Spline, Frame, SquareDashedBottom, Focus, MonitorPlay, Ghost, BookText, FileText
} from "lucide-react"

import { useMemo, useState } from "react"

import type { DesignSystemData, MemoryDocumentGroup } from "@/types/design-system"
import { NavGroup, NavItem } from "@/components/shared"

interface SidebarProps {
  data: DesignSystemData
  memoryGroups: MemoryDocumentGroup[]
  activeTab: string
  setActiveTab: (id: string) => void
  setActiveSubFilter: (id: string) => void
  theme: "light" | "dark"
  toggleTheme: () => void
}

export function Sidebar({
  data,
  memoryGroups,
  activeTab,
  setActiveTab,
  setActiveSubFilter,
  theme,
  toggleTheme
}: SidebarProps) {
  const [memoryOpen, setMemoryOpen] = useState(true)

  // Derived stats
  const compTypes = data.components.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1
    return acc
  }, {} as { [key: string]: number })

  const totalMemoryDocs = useMemo(
    () => memoryGroups.reduce((sum, group) => sum + group.items.length, 0),
    [memoryGroups]
  )

  return (
    <aside className="w-64 flex-shrink-0 border-r border-border bg-card/30 flex flex-col overflow-y-auto">
      <div className="p-5 border-b border-border sticky top-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-indigo-500 mb-1">
            <PenTool className="h-4 w-4" />
            <h1 className="font-bold tracking-tight text-[15px] text-foreground">Design Extractor</h1>
          </div>
          <p className="text-[10px] text-muted-foreground truncate font-mono w-40" title={data.meta.url}>{data.meta.url}</p>
        </div>
        <button 
          onClick={toggleTheme} 
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <div className="p-3 flex flex-col gap-6">
        <NavGroup title="General">
          <NavItem id="overview" icon={<Activity />} label="Overview" active={activeTab} onClick={setActiveTab} />
          <NavItem id="tree" icon={<FolderTree />} label="Component Tree" active={activeTab} onClick={setActiveTab} />
        </NavGroup>

        <NavGroup title="Design Tokens">
          <NavItem id="colors" icon={<Palette />} label="Colors" count={data.tokens.colors.length} active={activeTab} onClick={setActiveTab} />
          <NavItem id="gradients" icon={<Spline />} label="Gradients" count={data.tokens.gradients?.length || 0} active={activeTab} onClick={setActiveTab} />
          <NavItem id="typography" icon={<Type />} label="Typography" count={data.tokens.typography.length} active={activeTab} onClick={setActiveTab} />
          <NavItem id="spacing" icon={<Ruler />} label="Spacing" count={data.tokens.spacing.length} active={activeTab} onClick={setActiveTab} />
          <NavItem id="radii" icon={<Square />} label="Radii" count={data.tokens.radii.length} active={activeTab} onClick={setActiveTab} />
          <NavItem id="shadows" icon={<MoonStar />} label="Shadows" count={data.tokens.shadows.length} active={activeTab} onClick={setActiveTab} />
          <NavItem id="borders" icon={<SquareDashedBottom />} label="Borders" count={data.tokens.borders?.length || 0} active={activeTab} onClick={setActiveTab} />
          <NavItem id="transitions" icon={<Focus />} label="Transitions" count={data.tokens.transitions?.length || 0} active={activeTab} onClick={setActiveTab} />
          <NavItem id="css-vars" icon={<Wrench />} label="CSS Variables" count={data.cssVariables?.length || 0} active={activeTab} onClick={setActiveTab} />
          <NavItem id="fonts" icon={<FileType />} label="Font Files" count={data.fontFaces?.length || 0} active={activeTab} onClick={setActiveTab} />
        </NavGroup>

        <NavGroup title="Components">
          {Object.entries(compTypes).sort((a,b)=>b[1]-a[1]).map(([type, count]) => (
            <NavItem 
              key={type} 
              id={`comp-${type}`} 
              icon={<Box />} 
              label={type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ') + "s"} 
              count={count} 
              active={activeTab} 
              onClick={(id) => { setActiveTab(id); setActiveSubFilter("all"); }} 
            />
          ))}
        </NavGroup>
        
        <NavGroup title="Interactions">
          <NavItem id="hovers" icon={<MousePointerClick />} label="Hover States" count={data.interactions?.hoverStates?.length || 0} active={activeTab} onClick={setActiveTab} />
        </NavGroup>

        <NavGroup title="Patterns">
          <NavItem id="patterns" icon={<Repeat />} label="Repeated Patterns" count={data.patterns?.length || 0} active={activeTab} onClick={setActiveTab} />
        </NavGroup>

        <NavGroup title="Layout">
          <NavItem id="sections" icon={<LayoutTemplate />} label="Sections" count={data.sections.length} active={activeTab} onClick={setActiveTab} />
          <NavItem id="layout-system" icon={<Frame />} label="Layout System" active={activeTab} onClick={setActiveTab} />
        </NavGroup>

        <NavGroup title="Assets">
          <NavItem id="images" icon={<ImageIcon />} label="Images" count={data.assets.images.length} active={activeTab} onClick={setActiveTab} />
          <NavItem id="svgs" icon={<Boxes />} label="SVGs / Icons" count={data.assets.svgs.length} active={activeTab} onClick={setActiveTab} />
          <NavItem id="pseudos" icon={<Ghost />} label="Pseudo Elements" count={data.assets.pseudoElements?.length || 0} active={activeTab} onClick={setActiveTab} />
          {(data.assets.videos?.length || 0) > 0 && (
            <NavItem id="videos" icon={<MonitorPlay />} label="Videos" count={data.assets.videos.length} active={activeTab} onClick={setActiveTab} />
          )}
        </NavGroup>

        <NavGroup title="Design Memory">
          <NavItem
            id={memoryGroups[0]?.items[0] ? `memory:${memoryGroups[0].items[0].path}` : "memory"}
            icon={<BookText />}
            label="Markdown Docs"
            count={totalMemoryDocs}
            active={activeTab}
            onClick={() => {
              if (memoryGroups[0]?.items[0]) {
                setActiveTab(`memory:${memoryGroups[0].items[0].path}`)
              }
            }}
          />

          {memoryGroups.length > 0 && (
            <div className="mt-1 space-y-1 px-2">
              <button
                type="button"
                onClick={() => setMemoryOpen((value) => !value)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <span>Files</span>
                <span>{memoryOpen ? "-" : "+"}</span>
              </button>

              {memoryOpen && (
                <div className="space-y-3 pl-2">
                  {memoryGroups.map((group) => (
                    <div key={group.id} className="space-y-1">
                      <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                        {group.label}
                      </div>
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          const id = `memory:${item.path}`
                          const isActive = activeTab === id
                          return (
                            <button
                              key={item.path}
                              type="button"
                              onClick={() => setActiveTab(id)}
                              className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition-colors ${
                                isActive
                                  ? "bg-indigo-500/10 text-indigo-500"
                                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                              }`}
                            >
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{item.title}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </NavGroup>
      </div>
    </aside>
  )
}
