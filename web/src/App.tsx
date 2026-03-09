// ** import core packages
import { useEffect, useMemo, useState } from "react"
import { Activity, XCircle, Wand2 } from "lucide-react"

// ** import types
import type { DesignSystemData, MemoryDocumentGroup } from "@/types/design-system"

// ** import components
import { Sidebar } from "@/components/Sidebar"
import { ComponentDialog } from "@/components/dialogs/ComponentDialog"
import { SectionDialog } from "@/components/dialogs/SectionDialog"
import { SvgDialog } from "@/components/dialogs/SvgDialog"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

// ** import lib
import { OutputBaseProvider } from "@/lib/output-base"

// ** import views
import { PasswordView } from "@/views/PasswordView"
import { LandingView } from "@/views/LandingView"
import { ProgressView } from "@/views/ProgressView"
import { PageSelectorView } from "@/views/PageSelectorView"

// ** import types
import type { PageInfo } from "@/views/PageSelectorView"
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
  RemixLandingView,
  RemixStudioView,
  DashboardView,
} from "./views"

// ════════════════════════════════════════════════════
// APP MODES
// ════════════════════════════════════════════════════

type AppMode = "checking" | "password" | "dashboard" | "landing" | "page-selection" | "progress" | "explorer" | "remix-landing" | "remix-studio"

export default function App() {
  const [mode, setMode] = useState<AppMode>("checking")

  // Explorer state
  const [data, setData] = useState<DesignSystemData | null>(null)
  const [memoryGroups, setMemoryGroups] = useState<MemoryDocumentGroup[]>([])
  const [memoryContent, setMemoryContent] = useState("")
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [error, _setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState("overview")
  const [activeSubFilter, setActiveSubFilter] = useState("all")
  const [selectedComp, setSelectedComp] = useState<any>(null)
  const [selectedSection, setSelectedSection] = useState<any>(null)
  const [selectedSvg, setSelectedSvg] = useState<any>(null)

  const [theme, setTheme] = useState<"light" | "dark">("light")

  // Job tracking
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  // Active job API base (for explorer mode after extraction)
  const [jobApiBase, setJobApiBase] = useState<string | null>(null)

  // Page selection state
  const [discoveredPages, setDiscoveredPages] = useState<PageInfo[]>([])
  const [selectedUrl, setSelectedUrl] = useState<string>("")
  const [pendingRunMemory, setPendingRunMemory] = useState(false)

  // Remix state
  const [remixJobId, setRemixJobId] = useState<string | null>(null)

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"))

  // ── Initial auth check ──────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((status) => {
        if (status.requiresPassword && !status.authenticated) {
          setMode("password")
        } else {
          initializeApp()
        }
      })
      .catch(() => {
        // Server unreachable — try legacy mode (CLI-started server)
        initializeApp()
      })
  }, [])

  const initializeApp = () => {
    // Check localStorage for an active job
    const savedJobId = localStorage.getItem("uih_jobId")
    if (savedJobId) {
      // Verify job is still alive
      fetch(`/api/extract/${savedJobId}/status`)
        .then((res) => {
          if (res.ok) return res.json()
          throw new Error("Job not found")
        })
        .then((jobStatus) => {
          if (jobStatus.status === "running" || jobStatus.status === "queued") {
            setActiveJobId(savedJobId)
            setMode("progress")
          } else if (jobStatus.status === "done") {
            // Job finished while tab was closed — go to progress to show download
            setActiveJobId(savedJobId)
            setMode("progress")
          } else {
            localStorage.removeItem("uih_jobId")
            setMode("dashboard")
          }
        })
        .catch(() => {
          localStorage.removeItem("uih_jobId")
          setMode("dashboard")
        })
    } else {
      setMode("dashboard")
    }
  }

  const tryLoadLegacyExplorer = () => {
    // Try to load legacy /api/design-system (CLI mode)
    fetch("/api/design-system")
      .then((res) => {
        if (!res.ok) throw new Error("No data")
        return res.json()
      })
      .then((json) => {
        setData(json)
        setLoading(false)
        setMode("explorer")
        // Also load memory
        fetch("/api/memory")
          .then((res) => (res.ok ? res.json() : { groups: [] }))
          .then((memory) => setMemoryGroups(memory.groups ?? []))
          .catch(() => { })
      })
      .catch(() => {
        // No legacy data — show dashboard instead of landing
        setLoading(false)
        setMode("dashboard")
      })
  }

  const handleDashboardNavigate = (targetMode: 'explorer' | 'landing' | 'remix-landing' | 'remix-studio', data?: any) => {
    if (targetMode === 'explorer') {
      tryLoadLegacyExplorer()
    } else if (targetMode === 'remix-studio') {
      if (data?.jobId) {
        setRemixJobId(data.jobId)
        setMode("remix-studio")
      } else {
        // Create a new remix job starting from a prompt
        fetch("/api/remix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: data?.initialPrompt }),
        })
          .then(res => res.json())
          .then(resData => {
            if (resData.jobId) {
              setRemixJobId(resData.jobId)
              setMode("remix-studio")
            }
          })
          .catch(err => {
            console.error("Failed to start AI Studio:", err)
          })
      }
    } else {
      setMode(targetMode)
    }
  }
  // ── Memory content loading (explorer mode) ──────────────────────────
  useEffect(() => {
    if (mode !== "explorer") return
    if (!activeTab.startsWith("memory:")) {
      setMemoryContent("")
      setMemoryLoading(false)
      return
    }

    const docPath = activeTab.replace(/^memory:/, "")
    if (!docPath) return

    setMemoryLoading(true)

    const apiPath = jobApiBase
      ? `${jobApiBase}/memory/content?path=${encodeURIComponent(docPath)}`
      : `/api/memory/content?path=${encodeURIComponent(docPath)}`

    fetch(apiPath)
      .then((res) => {
        if (!res.ok) throw new Error("Not found")
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
  }, [activeTab, mode, jobApiBase])

  const activeMemoryPath = activeTab.startsWith("memory:")
    ? activeTab.replace(/^memory:/, "")
    : null

  const activeMemoryDoc = useMemo(
    () =>
      memoryGroups
        .flatMap((group) => group.items)
        .find((item) => item.path === activeMemoryPath) ?? null,
    [memoryGroups, activeMemoryPath]
  )

  // ── Handlers ────────────────────────────────────────────────────────

  const handleAuthenticated = () => {
    initializeApp()
  }

  const handlePagesDiscovered = (url: string, pages: PageInfo[], runMemory: boolean) => {
    setSelectedUrl(url)
    setDiscoveredPages(pages)
    setPendingRunMemory(runMemory)
    setMode("page-selection")
  }

  const handleResumeJob = (jobId: string) => {
    setActiveJobId(jobId)
    setMode("progress")
  }

  const handlePagesSelected = (_selectedPages: string[]) => {
    // The PageSelectorView already called POST /api/extract and stored jobId
    // in localStorage. We just need to read it and transition to progress.
    const jobId = localStorage.getItem("uih_jobId")
    if (jobId) {
      setActiveJobId(jobId)
      setMode("progress")
    }
  }

  const handleViewExplorer = (resultData: any) => {
    setData(resultData)
    setLoading(false)
    setMode("explorer")

    // Load memory from job endpoint
    if (activeJobId) {
      setJobApiBase(`/api/extract/${activeJobId}`)
      fetch(`/api/extract/${activeJobId}/memory`)
        .then((res) => (res.ok ? res.json() : { groups: [] }))
        .then((memory) => setMemoryGroups(memory.groups ?? []))
        .catch(() => { })
    }
  }

  const handleBackToLanding = () => {
    setActiveJobId(null)
    setJobApiBase(null)
    setDiscoveredPages([])
    setSelectedUrl("")
    setMode("dashboard")
  }

  // ── Remix Handlers ──────────────────────────────────────────────────

  const handleStartRemix = async (referenceUrl: string, targetUrl: string) => {
    try {
      const res = await fetch("/api/remix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceUrl, targetUrl: targetUrl || undefined }),
      })
      const data = await res.json()
      if (data.jobId) {
        setRemixJobId(data.jobId)
        setMode("remix-studio")
      }
    } catch (err) {
      console.error("Failed to start remix:", err)
    }
  }

  const handleRemixBack = () => {
    setRemixJobId(null)
    setMode("dashboard")
  }

  // ════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════

  // Checking auth status
  if (mode === "checking") {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background text-muted-foreground">
        <Activity className="h-6 w-6 animate-pulse text-primary" />
      </div>
    )
  }

  // Password gate
  if (mode === "password") {
    return <PasswordView onAuthenticated={handleAuthenticated} />
  }

  // Dashboard
  if (mode === "dashboard") {
    return <DashboardView onNavigate={handleDashboardNavigate} />
  }

  // Landing page
  if (mode === "landing") {
    return (
      <LandingView
        onPagesDiscovered={handlePagesDiscovered}
        existingJobId={localStorage.getItem("uih_jobId")}
        onResumeJob={handleResumeJob}
      />
    )
  }

  // Remix landing
  if (mode === "remix-landing") {
    return (
      <RemixLandingView
        onStartRemix={handleStartRemix}
        onBack={handleBackToLanding}
      />
    )
  }

  // Remix studio
  if (mode === "remix-studio" && remixJobId) {
    return (
      <RemixStudioView
        jobId={remixJobId}
        onBack={handleRemixBack}
      />
    )
  }

  // Page selection
  if (mode === "page-selection") {
    return (
      <PageSelectorView
        url={selectedUrl}
        pages={discoveredPages}
        runMemory={pendingRunMemory}
        onStartExtraction={handlePagesSelected}
        onBack={handleBackToLanding}
      />
    )
  }

  // Progress view
  if (mode === "progress" && activeJobId) {
    return (
      <ProgressView
        jobId={activeJobId}
        onViewExplorer={handleViewExplorer}
        onBack={handleBackToLanding}
      />
    )
  }

  // Explorer mode — loading
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

  // Explorer mode — error
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

  // Explorer mode — full app
  const uniqueVariants = new Set(data.components.map((c) => c.signature)).size
  const outputBase = activeJobId
    ? `/api/extract/${activeJobId}/output`
    : "/output"

  return (
    <OutputBaseProvider value={outputBase}>
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
            downloadUrl={activeJobId ? `/api/extract/${activeJobId}/download` : null}
          />

          <main className="flex-1 overflow-y-auto bg-background p-8 scroll-smooth lg:p-12 relative w-full flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <SidebarTrigger />
              <button
                className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                onClick={() => setMode("remix-landing")}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Remix
              </button>
            </div>
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
    </OutputBaseProvider>
  )
}
