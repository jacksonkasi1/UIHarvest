// ** import core packages
import { useEffect, useMemo, useState } from "react"
import { Activity, XCircle } from "lucide-react"

// ** import types
import type { DesignSystemData, MemoryDocumentGroup } from "@/types/design-system"

// ** import components
import { Sidebar } from "@/components/Sidebar"
import { ComponentDialog } from "@/components/dialogs/ComponentDialog"
import { SectionDialog } from "@/components/dialogs/SectionDialog"
import { SvgDialog } from "@/components/dialogs/SvgDialog"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

// ** import apis
import {
  OverviewView,
  TreeView,
  ColorsView,
  TypographyView,
  SpacingView,
  RadiiView,
  ShadowsView,
  PatternsView,
  ComponentsView,
  SectionsView,
  ImagesView,
  SvgsView,
  GradientsView,
  BordersView,
  TransitionsView,
  CssVarsView,
  FontFilesView,
  HoversView,
  LayoutSystemView,
  PseudoElementsView,
  VideosView,
  MemoryView,
} from "./views"

export default function App() {
  const [data, setData] = useState<DesignSystemData | null>(null)
  const [memoryGroups, setMemoryGroups] = useState<MemoryDocumentGroup[]>([])
  const [memoryContent, setMemoryContent] = useState("")
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState("overview")
  const [activeSubFilter, setActiveSubFilter] = useState("all")
  const [selectedComp, setSelectedComp] = useState<any>(null)
  const [selectedSection, setSelectedSection] = useState<any>(null)
  const [selectedSvg, setSelectedSvg] = useState<any>(null)

  const [theme, setTheme] = useState<"light" | "dark">("dark")

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"))

  useEffect(() => {
    Promise.all([
      fetch("/api/design-system").then((res) => {
        if (!res.ok) throw new Error("Could not load design system data. Did you run the extractor?")
        return res.json()
      }),
      fetch("/api/memory")
        .then((res) => (res.ok ? res.json() : { available: false, groups: [] }))
        .catch(() => ({ available: false, groups: [] })),
    ])
      .then(([json, memory]) => {
        setData(json)
        setMemoryGroups(memory.groups ?? [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!activeTab.startsWith("memory:")) {
      setMemoryContent("")
      setMemoryLoading(false)
      return
    }

    const path = activeTab.replace(/^memory:/, "")
    if (!path) return

    setMemoryLoading(true)
    fetch(`/api/memory/content?path=${encodeURIComponent(path)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load design memory markdown.")
        return res.json()
      })
      .then((json) => {
        setMemoryContent(json.content ?? "")
        setMemoryLoading(false)
      })
      .catch(() => {
        setMemoryContent("")
        setMemoryLoading(false)
      })
  }, [activeTab])

  const activeMemoryPath = activeTab.startsWith("memory:") ? activeTab.replace(/^memory:/, "") : null

  const activeMemoryDoc = useMemo(
    () => memoryGroups.flatMap((group) => group.items).find((item) => item.path === activeMemoryPath) ?? null,
    [memoryGroups, activeMemoryPath]
  )

  if (loading) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-4">
          <Activity className="h-8 w-8 animate-pulse text-primary" />
          <p className="text-sm font-medium">Loading Design System...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-background p-8 text-center text-muted-foreground">
        <XCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold text-foreground">Failed to load data</h2>
        <p className="text-sm">{error}</p>
        <p className="mt-4 max-w-md text-xs text-muted-foreground">
          Make sure you&apos;ve run the extractor and the <code className="rounded bg-muted px-1 py-0.5 text-primary/80">output</code> folder is available.
        </p>
      </div>
    )
  }

  const uniqueVariants = new Set(data.components.map((c) => c.signature)).size

  return (
    <SidebarProvider>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground font-sans selection:bg-primary/30 w-full">
        <Sidebar
          data={data}
          memoryGroups={memoryGroups}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setActiveSubFilter={setActiveSubFilter}
          theme={theme}
          toggleTheme={toggleTheme}
        />

        <main className="flex-1 overflow-y-auto bg-background p-8 scroll-smooth lg:p-12 relative w-full flex flex-col">
          <SidebarTrigger className="absolute top-4 left-4" />
          <div className="mx-auto max-w-6xl w-full space-y-8 mt-6 lg:mt-0">
          {activeTab === "overview" && <OverviewView data={data} uniqueVariants={uniqueVariants} />}
          {activeTab === "tree" && <TreeView data={data} setSelectedComp={setSelectedComp} />}
          {activeTab === "colors" && <ColorsView data={data} />}
          {activeTab === "gradients" && <GradientsView data={data} />}
          {activeTab === "typography" && <TypographyView data={data} />}
          {activeTab === "spacing" && <SpacingView data={data} />}
          {activeTab === "radii" && <RadiiView data={data} />}
          {activeTab === "shadows" && <ShadowsView data={data} />}
          {activeTab === "borders" && <BordersView data={data} />}
          {activeTab === "transitions" && <TransitionsView data={data} />}
          {activeTab === "css-vars" && <CssVarsView data={data} />}
          {activeTab === "fonts" && <FontFilesView data={data} />}

          {activeTab === "hovers" && <HoversView data={data} setSelectedComp={setSelectedComp} />}

          {activeTab === "patterns" && <PatternsView data={data} setSelectedComp={setSelectedComp} />}
          {activeTab.startsWith("comp-") && (
            <ComponentsView
              data={data}
              activeTab={activeTab}
              activeSubFilter={activeSubFilter}
              setActiveSubFilter={setActiveSubFilter}
              setSelectedComp={setSelectedComp}
            />
          )}
          {activeTab === "sections" && <SectionsView data={data} setSelectedSection={setSelectedSection} />}
          {activeTab === "layout-system" && <LayoutSystemView data={data} />}

          {activeTab === "images" && <ImagesView data={data} />}
          {activeTab === "svgs" && <SvgsView data={data} setSelectedSvg={setSelectedSvg} />}
          {activeTab === "pseudos" && <PseudoElementsView data={data} />}
          {activeTab === "videos" && <VideosView data={data} />}

          {activeTab.startsWith("memory:") && (
            <MemoryView
              data={data}
              groups={memoryGroups}
              activeDoc={activeMemoryDoc}
              markdown={memoryContent}
              loading={memoryLoading}
            />
          )}
          </div>
        </main>

        <ComponentDialog selectedComp={selectedComp} setSelectedComp={setSelectedComp} data={data} />
        <SectionDialog selectedSection={selectedSection} setSelectedSection={setSelectedSection} data={data} setSelectedComp={setSelectedComp} />
        <SvgDialog selectedSvg={selectedSvg} setSelectedSvg={setSelectedSvg} />
      </div>
    </SidebarProvider>
  )
}
