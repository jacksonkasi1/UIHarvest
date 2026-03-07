// ** import core packages
import { useMemo, useState, type ReactNode } from "react"

// ** import utils
import { BookOpen, Copy, LoaderCircle } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

// ** import types
import type { DesignSystemData, MemoryDocumentGroup, MemoryDocumentItem } from "@/types/design-system"

// ** import components
import { Header } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extractHeadings(markdown: string): Array<{ id: string; label: string }> {
  return markdown
    .split("\n")
    .filter((line) => /^#{1,3}\s+/.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, "").trim())
    .filter(Boolean)
    .map((label) => ({ id: slugify(label), label }))
}

export function MemoryView({
  data,
  groups,
  activeDoc,
  markdown,
  loading,
}: {
  data: DesignSystemData
  groups: MemoryDocumentGroup[]
  activeDoc: MemoryDocumentItem | null
  markdown: string
  loading: boolean
}) {
  const [copied, setCopied] = useState(false)

  const stats = useMemo(
    () => ({
      docs: groups.reduce((sum, group) => sum + group.items.length, 0),
      components: data.components.length,
      tokens: data.tokens.colors.length + data.tokens.typography.length + data.tokens.spacing.length,
      assets: data.assets.images.length + data.assets.svgs.length,
    }),
    [data, groups]
  )

  const headings = useMemo(() => extractHeadings(markdown), [markdown])

  const handleCopy = async () => {
    if (!markdown) return
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Header
        title={activeDoc?.title ?? "Design Memory"}
        subtitle={activeDoc?.path ?? "Browse the generated markdown memory for this extracted design system."}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Docs" value={stats.docs} />
        <Stat label="Components" value={stats.components} />
        <Stat label="Tokens" value={stats.tokens} />
        <Stat label="Assets" value={stats.assets} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="overflow-hidden border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                Markdown Render
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {activeDoc && <Badge variant="outline">{formatBytes(activeDoc.size)}</Badge>}
                <Badge variant="outline">{groups.length} groups</Badge>
              </div>
            </div>

            <Button onClick={handleCopy} disabled={!markdown}>
              <Copy className="h-4 w-4" />
              {copied ? "Copied" : "Copy markdown"}
            </Button>
          </div>

          {loading ? (
            <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
              <div className="flex flex-col items-center gap-3">
                <LoaderCircle className="h-7 w-7 animate-spin text-indigo-500" />
                <p className="text-sm">Loading markdown...</p>
              </div>
            </div>
          ) : markdown ? (
            <article className="memory-markdown px-6 py-6 lg:px-8 lg:py-8">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {markdown}
              </ReactMarkdown>
            </article>
          ) : (
            <div className="flex min-h-[40vh] items-center justify-center px-8 py-12 text-center text-muted-foreground">
              No design memory content available.
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Document outline</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {headings.length > 0 ? (
                headings.map((heading) => (
                  <a
                    key={heading.id}
                    href={`#${heading.id}`}
                    className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground hover:border-indigo-500/40 hover:text-foreground"
                  >
                    {heading.label}
                  </a>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No headings detected.</span>
              )}
            </div>
          </Card>

          <Card className="border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Source context</h3>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider">URL</div>
                <div className="mt-1 break-all font-mono text-xs">{data.meta.url}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider">Viewport</div>
                <div className="mt-1 font-mono text-xs">{data.meta.viewport.width} × {data.meta.fullHeight}px</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold text-indigo-500 tabular-nums">{value}</div>
    </div>
  )
}

const markdownComponents = {
  h1: ({ children }: { children?: ReactNode }) => {
    const label = String(children ?? "")
    return <h1 id={slugify(label)} className="mt-8 text-4xl font-bold tracking-tight text-foreground first:mt-0">{children}</h1>
  },
  h2: ({ children }: { children?: ReactNode }) => {
    const label = String(children ?? "")
    return <h2 id={slugify(label)} className="mt-10 border-t border-border pt-8 text-2xl font-semibold text-foreground">{children}</h2>
  },
  h3: ({ children }: { children?: ReactNode }) => {
    const label = String(children ?? "")
    return <h3 id={slugify(label)} className="mt-8 text-xl font-semibold text-foreground">{children}</h3>
  },
  p: ({ children }: { children?: ReactNode }) => <p className="mt-4 text-[15px] leading-7 text-muted-foreground">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="mt-4 space-y-2 pl-6 text-[15px] leading-7 text-muted-foreground">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="mt-4 space-y-2 pl-6 text-[15px] leading-7 text-muted-foreground">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="list-disc">{children}</li>,
  blockquote: ({ children }: { children?: ReactNode }) => <blockquote className="mt-6 rounded-xl border-l-4 border-indigo-500 bg-indigo-500/5 px-5 py-4 text-sm italic text-foreground/90">{children}</blockquote>,
  code: ({ inline, children, className }: { inline?: boolean; children?: ReactNode; className?: string }) => {
    if (inline) {
      return <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">{children}</code>
    }

    return (
      <pre className="mt-5 overflow-x-auto rounded-xl border border-border bg-[#0b1220] px-4 py-4 text-sm text-slate-100 shadow-sm">
        <code className={className}>{children}</code>
      </pre>
    )
  },
  table: ({ children }: { children?: ReactNode }) => <div className="mt-6 overflow-x-auto rounded-xl border border-border"><table className="min-w-full border-collapse text-left text-sm">{children}</table></div>,
  thead: ({ children }: { children?: ReactNode }) => <thead className="bg-muted/60 text-foreground">{children}</thead>,
  th: ({ children }: { children?: ReactNode }) => <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</th>,
  td: ({ children }: { children?: ReactNode }) => <td className="border-b border-border px-4 py-3 align-top text-sm text-muted-foreground">{children}</td>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => <a href={href} className="font-medium text-indigo-500 underline underline-offset-4 hover:text-indigo-400">{children}</a>,
}
