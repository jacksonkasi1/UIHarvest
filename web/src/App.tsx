import { useEffect, useState } from "react"
import { Activity, XCircle } from "lucide-react"

import type { DesignSystemData } from "@/types/design-system"
import { Sidebar } from "@/components/Sidebar"
import { ComponentDialog } from "@/components/dialogs/ComponentDialog"
import { SectionDialog } from "@/components/dialogs/SectionDialog"
import { SvgDialog } from "@/components/dialogs/SvgDialog"

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
  VideosView
} from "./views"

// -- APP --
export default function App() {
  const [data, setData] = useState<DesignSystemData | null>(null)
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

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark")

  useEffect(() => {
    fetch("/output/design-system.json")
      .then((res) => {
        if (!res.ok) throw new Error("Could not load design system data. Did you run the extractor?")
        return res.json()
      })
      .then((json) => {
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-4">
          <Activity className="h-8 w-8 animate-pulse text-indigo-500" />
          <p className="text-sm font-medium">Loading Design System...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-muted-foreground p-8 text-center">
        <XCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold text-foreground">Failed to load data</h2>
        <p className="text-sm">{error}</p>
        <p className="text-xs text-muted-foreground mt-4 max-w-md">
          Make sure you've run the extractor and the <code className="bg-muted px-1 py-0.5 rounded text-indigo-400">output</code> folder is available.
        </p>
      </div>
    )
  }

  // Derived stats
  const uniqueVariants = new Set(data.components.map(c => c.signature)).size

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans selection:bg-indigo-500/30">
      
      {/* SIDEBAR */}
      <Sidebar 
        data={data}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setActiveSubFilter={setActiveSubFilter}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto p-8 lg:p-12 scroll-smooth bg-background">
        <div className="max-w-6xl mx-auto space-y-8">
          
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

        </div>
      </main>

      {/* MODALS */}
      <ComponentDialog selectedComp={selectedComp} setSelectedComp={setSelectedComp} data={data} />
      <SectionDialog selectedSection={selectedSection} setSelectedSection={setSelectedSection} data={data} setSelectedComp={setSelectedComp} />
      <SvgDialog selectedSvg={selectedSvg} setSelectedSvg={setSelectedSvg} />

    </div>
  )
}
