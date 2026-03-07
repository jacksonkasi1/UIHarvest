import {
  Palette, Type, Ruler, Square, MoonStar, Image as ImageIcon,
  PenTool, Boxes, Activity, Box, LayoutTemplate,
  Sun, Moon, FolderTree, Repeat, Wrench, FileType,
  MousePointerClick, Spline, Frame, SquareDashedBottom, Focus, MonitorPlay, Ghost, BookText, FileText, ChevronDown
} from "lucide-react"

import { useMemo } from "react"

import type { DesignSystemData, MemoryDocumentGroup } from "@/types/design-system"
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface SidebarProps {
  data: DesignSystemData
  memoryGroups: MemoryDocumentGroup[]
  activeTab: string
  setActiveTab: (id: string) => void
  setActiveSubFilter: (id: string) => void
  theme: "light" | "dark"
  toggleTheme: () => void
}

function NavItem({ 
  id, 
  icon, 
  label, 
  count, 
  onClick, 
  activeTab, 
  setActiveTab 
}: { 
  id: string; 
  icon: React.ReactNode; 
  label: string; 
  count?: number; 
  onClick?: () => void;
  activeTab: string;
  setActiveTab: (id: string) => void;
}) {
  const isActive = activeTab === id
  return (
    <SidebarMenuItem>
      <SidebarMenuButton 
        isActive={isActive} 
        onClick={onClick ? onClick : () => setActiveTab(id)}
        tooltip={label}
      >
        {icon}
        <span>{label}</span>
      </SidebarMenuButton>
      {count !== undefined && (
        <SidebarMenuBadge>{count}</SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
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
    <ShadcnSidebar variant="inset" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2 text-primary mb-1">
              <PenTool className="h-5 w-5 shrink-0" />
              <span className="font-bold tracking-tight text-[15px] truncate">Design Extractor</span>
            </div>
            <p className="text-[10px] text-sidebar-foreground/70 truncate font-mono" title={data.meta.url}>{data.meta.url}</p>
          </div>
          <div className="hidden group-data-[collapsible=icon]:flex w-full items-center justify-center">
            <PenTool className="h-5 w-5 text-primary shrink-0" />
          </div>
          <button 
            onClick={toggleTheme} 
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors shrink-0 group-data-[collapsible=icon]:hidden"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>General</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem id="overview" icon={<Activity />} label="Overview" activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="tree" icon={<FolderTree />} label="Component Tree" activeTab={activeTab} setActiveTab={setActiveTab} />
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Design Tokens</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem id="colors" icon={<Palette />} label="Colors" count={data.tokens.colors.length} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="gradients" icon={<Spline />} label="Gradients" count={data.tokens.gradients?.length || 0} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="typography" icon={<Type />} label="Typography" count={data.tokens.typography.length} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="spacing" icon={<Ruler />} label="Spacing" count={data.tokens.spacing.length} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="radii" icon={<Square />} label="Radii" count={data.tokens.radii.length} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="shadows" icon={<MoonStar />} label="Shadows" count={data.tokens.shadows.length} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="borders" icon={<SquareDashedBottom />} label="Borders" count={data.tokens.borders?.length || 0} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="transitions" icon={<Focus />} label="Transitions" count={data.tokens.transitions?.length || 0} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="css-vars" icon={<Wrench />} label="CSS Variables" count={data.cssVariables?.length || 0} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="fonts" icon={<FileType />} label="Font Files" count={data.fontFaces?.length || 0} activeTab={activeTab} setActiveTab={setActiveTab} />
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Components</SidebarGroupLabel>
          <SidebarMenu>
            {Object.entries(compTypes).sort((a,b)=>b[1]-a[1]).map(([type, count]) => (
              <NavItem 
                key={type} 
                id={`comp-${type}`} 
                icon={<Box />} 
                label={type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ') + "s"} 
                count={count} 
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onClick={() => { setActiveTab(`comp-${type}`); setActiveSubFilter("all"); }} 
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel>Interactions</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem id="hovers" icon={<MousePointerClick />} label="Hover States" count={data.interactions?.hoverStates?.length || 0} activeTab={activeTab} setActiveTab={setActiveTab} />
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Patterns</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem id="patterns" icon={<Repeat />} label="Repeated Patterns" count={data.patterns?.length || 0} activeTab={activeTab} setActiveTab={setActiveTab} />
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Layout</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem id="sections" icon={<LayoutTemplate />} label="Sections" count={data.sections.length} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="layout-system" icon={<Frame />} label="Layout System" activeTab={activeTab} setActiveTab={setActiveTab} />
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Assets</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem id="images" icon={<ImageIcon />} label="Images" count={data.assets.images.length} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="svgs" icon={<Boxes />} label="SVGs / Icons" count={data.assets.svgs.length} activeTab={activeTab} setActiveTab={setActiveTab} />
            <NavItem id="pseudos" icon={<Ghost />} label="Pseudo Elements" count={data.assets.pseudoElements?.length || 0} activeTab={activeTab} setActiveTab={setActiveTab} />
            {(data.assets.videos?.length || 0) > 0 && (
              <NavItem id="videos" icon={<MonitorPlay />} label="Videos" count={data.assets.videos.length} activeTab={activeTab} setActiveTab={setActiveTab} />
            )}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Design Memory</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem
              id={memoryGroups[0]?.items[0] ? `memory:${memoryGroups[0].items[0].path}` : "memory"}
              icon={<BookText />}
              label="Markdown Docs"
              count={totalMemoryDocs}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onClick={() => {
                if (memoryGroups[0]?.items[0]) {
                  setActiveTab(`memory:${memoryGroups[0].items[0].path}`)
                }
              }}
            />
          </SidebarMenu>
        </SidebarGroup>

        {memoryGroups.length > 0 && (
          <Collapsible defaultOpen className="group/collapsible">
            <SidebarGroup>
              <SidebarGroupLabel render={
                <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md transition-colors cursor-pointer text-sidebar-foreground/70 group-data-[state=open]/collapsible:text-sidebar-foreground">
                  <span>Files</span>
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:-rotate-180" />
                </CollapsibleTrigger>
              } />
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {memoryGroups.map((group) => (
                      <div key={group.id} className="mt-1">
                        <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                          {group.label}
                        </div>
                        {group.items.map((item) => {
                          const id = `memory:${item.path}`
                          const isActive = activeTab === id
                          return (
                            <SidebarMenuItem key={item.path}>
                              <SidebarMenuButton 
                                isActive={isActive}
                                onClick={() => setActiveTab(id)}
                              >
                                <FileText />
                                <span>{item.title}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          )
                        })}
                      </div>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        )}
      </SidebarContent>
    </ShadcnSidebar>
  )
}
