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
        <Card className="flex flex-col overflow-hidden shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b px-5 py-4 bg-muted/20">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                Markdown Render
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {activeDoc && <Badge variant="secondary" className="font-normal text-xs">{formatBytes(activeDoc.size)}</Badge>}
                <Badge variant="secondary" className="font-normal text-xs">{groups.length} groups</Badge>
              </div>
            </div>

            <Button onClick={handleCopy} disabled={!markdown} size="sm" variant="secondary" className="gap-2 shrink-0">
              <Copy className="h-4 w-4" />
              {copied ? "Copied" : "Copy markdown"}
            </Button>
          </div>

          <div className="flex-1 overflow-auto bg-background">
            {loading ? (
              <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">
                <div className="flex flex-col items-center gap-3">
                  <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm">Loading markdown...</p>
                </div>
              </div>
            ) : markdown ? (
              <article className="px-6 py-8 lg:px-10 lg:py-10 max-w-4xl mx-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {markdown}
                </ReactMarkdown>
              </article>
            ) : (
              <div className="flex min-h-[400px] items-center justify-center px-8 py-12 text-center text-sm text-muted-foreground">
                No design memory content available.
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Document outline</h3>
            <div className="mt-4 flex flex-col gap-1.5">
              {headings.length > 0 ? (
                headings.map((heading) => (
                  <a
                    key={heading.id}
                    href={`#${heading.id}`}
                    className="truncate rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {heading.label}
                  </a>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No headings detected.</span>
              )}
            </div>
          </Card>

          <Card className="p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Source context</h3>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">URL</div>
                <div className="mt-1 break-all font-mono text-xs text-foreground">{data.meta.url}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Viewport</div>
                <div className="mt-1 font-mono text-xs text-foreground">{data.meta.viewport.width} × {data.meta.fullHeight}px</div>
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
    <div className="flex flex-col justify-between rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</div>
    </div>
  )
}

const markdownComponents = {
  h1: ({ children }: { children?: ReactNode }) => {
    const label = String(children ?? "")
    return <h1 id={slugify(label)} className="mt-2 scroll-m-20 text-3xl font-bold tracking-tight text-foreground first:mt-0">{children}</h1>
  },
  h2: ({ children }: { children?: ReactNode }) => {
    const label = String(children ?? "")
    return <h2 id={slugify(label)} className="mt-8 scroll-m-20 border-b pb-2 text-2xl font-semibold tracking-tight text-foreground first:mt-0">{children}</h2>
  },
  h3: ({ children }: { children?: ReactNode }) => {
    const label = String(children ?? "")
    return <h3 id={slugify(label)} className="mt-8 scroll-m-20 text-xl font-semibold tracking-tight text-foreground">{children}</h3>
  },
  h4: ({ children }: { children?: ReactNode }) => {
    const label = String(children ?? "")
    return <h4 id={slugify(label)} className="mt-8 scroll-m-20 text-lg font-semibold tracking-tight text-foreground">{children}</h4>
  },
  p: ({ children }: { children?: ReactNode }) => <p className="leading-7 [&:not(:first-child)]:mt-5 text-[15px] text-muted-foreground">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="my-5 ml-6 list-disc [&>li]:mt-2 text-[15px] text-muted-foreground">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="my-5 ml-6 list-decimal [&>li]:mt-2 text-[15px] text-muted-foreground">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li>{children}</li>,
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="mt-6 border-l-2 border-primary pl-6 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ inline, children, className, ...props }: any) => {
    const isInline = inline || !className;
    if (isInline) {
      return <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-[13px] text-foreground" {...props}>{children}</code>
    }

    return (
      <pre className="my-6 overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-[13px] text-foreground shadow-sm">
        <code className={className} {...props}>{children}</code>
      </pre>
    )
  },
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-6 w-full overflow-y-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => <thead className="border-b">{children}</thead>,
  tr: ({ children }: { children?: ReactNode }) => <tr className="m-0 border-t p-0 even:bg-muted/50">{children}</tr>,
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border-b px-4 py-2 text-left font-bold text-foreground [&[align=center]]:text-center [&[align=right]]:text-right">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="px-4 py-2 text-left text-muted-foreground [&[align=center]]:text-center [&[align=right]]:text-right">
      {children}
    </td>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} className="font-medium text-primary underline underline-offset-4 hover:opacity-80 transition-opacity">
      {children}
    </a>
  ),
}
