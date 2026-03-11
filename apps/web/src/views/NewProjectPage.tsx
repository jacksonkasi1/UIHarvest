// ** import core packages
import { useState, useEffect, useRef, KeyboardEvent } from "react"
import { ArrowUp, Sparkles, Clock, ChevronRight, Loader2 } from "lucide-react"
import axios from "axios"

// ** import apis
import { createProject, getProjects } from "@/rest-api"

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectMeta {
  id: string
  status: string
  phase: string
  createdAt: number
  updatedAt: number
  initialPrompt?: string
  targetUrl?: string
  referenceUrl?: string
}

// ── Suggestion prompts ────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "A task manager with drag-and-drop and priority labels",
  "A personal finance dashboard with charts",
  "A recipe app with search, filters, and shopping list",
  "A Pomodoro timer with progress tracking",
  "A markdown note-taking app with live preview",
  "A weather app with hourly forecast and animated icons",
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function deriveName(prompt: string): string {
  // Take the first 4–6 meaningful words as the project name
  const words = prompt.trim().split(/\s+/).slice(0, 5)
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return "just now"
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

// ── Component ────────────────────────────────────────────────────────────────

interface NewProjectPageProps {
  onProjectCreated: (projectId: string) => void
}

export function NewProjectPage({ onProjectCreated }: NewProjectPageProps) {
  const [prompt, setPrompt] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentProjects, setRecentProjects] = useState<ProjectMeta[]>([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load recent projects
  useEffect(() => {
    getProjects()
      .then((data) => {
        const all: ProjectMeta[] = data.projects ?? []
        // Show only standalone projects (no targetUrl / referenceUrl)
        const standalone = all.filter((p) => !p.targetUrl && !p.referenceUrl)
        setRecentProjects(standalone.slice(0, 8))
      })
      .catch(() => {})
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [prompt])

  const handleCreate = async () => {
    const trimmed = prompt.trim()
    if (!trimmed || isCreating) return
    setIsCreating(true)
    setError(null)

    try {
      const data = await createProject({
        name: deriveName(trimmed),
        initialPrompt: trimmed,
      })
      onProjectCreated(data.projectId as string)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error ?? err.message ?? "Something went wrong")
      } else {
        setError((err as Error).message ?? "Something went wrong")
      }
      setIsCreating(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleCreate()
    }
  }

  const handleSuggestionClick = (s: string) => {
    setPrompt(s)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex h-dvh w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      {isSidebarOpen && (
        <aside className="w-64 border-r border-border bg-muted/20 flex flex-col shrink-0">
          <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
            <span className="text-[13px] font-semibold text-foreground tracking-tight">
              Recent Projects
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {recentProjects.length === 0 ? (
              <div className="text-[12px] text-muted-foreground p-2">No recent projects</div>
            ) : (
              recentProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => onProjectCreated(project.id)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-secondary/80 transition-colors group flex items-center justify-between"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-medium text-foreground truncate">
                      {project.initialPrompt ? deriveName(project.initialPrompt) : `Project ${project.id.slice(0, 8)}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {timeAgo(project.updatedAt)}
                    </span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center px-6 border-b border-border">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/80 text-muted-foreground mr-3 transition-colors"
          >
            <Clock className="w-4 h-4" />
          </button>
          <div
            className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF512F] via-[#F09819] to-[#DD2476] flex items-center justify-center shadow-sm"
            style={{ borderRadius: "10px 10px 10px 4px" }}
          >
            <div className="w-3 h-3 rounded-full bg-white/20" />
          </div>
          <span className="ml-3 text-[15px] font-semibold text-foreground tracking-tight">
            UIHarvest Studio
          </span>
        </header>

        {/* Main */}
        <main className="flex flex-1 flex-col items-center justify-start pt-[10vh] px-4 overflow-y-auto">
          <div className="w-full max-w-2xl space-y-8 pb-12">
          {/* Hero text */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-secondary/60 text-[12px] text-muted-foreground font-medium mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              AI-powered vibe coding
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground leading-tight">
              What are we building?
            </h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Describe your idea and get a fully functional React app — live preview included.
            </p>
          </div>

          {/* Prompt input */}
          <div className="relative">
            <div
              className={`relative flex flex-col rounded-2xl border bg-background shadow-sm transition-all ${
                isCreating
                  ? "border-border/60 opacity-60 pointer-events-none"
                  : "border-border hover:border-border/80 focus-within:border-foreground/30 focus-within:shadow-md"
              }`}
            >
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="A task manager with drag-and-drop, dark mode, and priority labels…"
                rows={3}
                className="w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none leading-relaxed"
                disabled={isCreating}
                autoFocus
              />
              <div className="flex items-center justify-between px-4 pb-3 pt-1">
                <span className="text-[12px] text-muted-foreground/50">
                  Press Enter to create · Shift+Enter for newline
                </span>
                <button
                  aria-label="Create project"
                  onClick={handleCreate}
                  disabled={!prompt.trim() || isCreating}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-foreground text-background disabled:opacity-40 disabled:pointer-events-none hover:opacity-90 transition-opacity shadow-sm"
                >
                  {isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="mt-2 text-[13px] text-destructive">{error}</p>
            )}
          </div>

          {/* Suggestion chips */}
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wider px-0.5">
              Try one of these
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestionClick(s)}
                  disabled={isCreating}
                  className="px-3 py-1.5 rounded-full border border-border bg-secondary/50 text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary hover:border-border/80 transition-all disabled:opacity-40 disabled:pointer-events-none"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Recent projects */}
          {recentProjects.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wider px-0.5 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Recent projects
              </p>
              <div className="flex flex-col gap-1">
                {recentProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => onProjectCreated(project.id)}
                    disabled={isCreating}
                    className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-border/60 bg-secondary/30 hover:bg-secondary/60 hover:border-border transition-all group text-left disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[13px] font-medium text-foreground truncate">
                        {project.initialPrompt
                          ? deriveName(project.initialPrompt)
                          : `Project ${project.id.slice(0, 8)}`}
                      </span>
                      {project.initialPrompt && (
                        <span className="text-[12px] text-muted-foreground truncate max-w-[500px]">
                          {project.initialPrompt}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <span className="text-[12px] text-muted-foreground">
                        {timeAgo(project.updatedAt)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  )
}
