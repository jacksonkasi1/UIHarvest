// ** import core packages
import { useEffect, useMemo, useState } from "react"
import Editor from "@monaco-editor/react"

// ** import icons
import {
    FileCode, Folder, FolderOpen, ChevronRight, ChevronDown,
    Copy, Check, FileJson, FileText, FileType
} from "lucide-react"

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

interface GeneratedFile {
    path: string
    content: string
}

interface CodeEditorProps {
    files: GeneratedFile[]
    selectedFile: string | null
    onSelectFile: (path: string) => void
    onFileChange?: (path: string, content: string) => void
}

interface TreeNode {
    name: string
    path: string
    isDir: boolean
    children: TreeNode[]
}

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════

function getLanguage(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() ?? ""
    const map: Record<string, string> = {
        tsx: "tsx",
        ts: "typescript",
        jsx: "jsx",
        js: "javascript",
        css: "css",
        json: "json",
        md: "markdown",
        html: "markup",
        sh: "bash",
    }
    return map[ext] ?? "typescript"
}

function getFileIcon(path: string) {
    const ext = path.split(".").pop()?.toLowerCase() ?? ""
    if (ext === "json") return <FileJson className="h-3.5 w-3.5 text-yellow-500" />
    if (ext === "css") return <FileType className="h-3.5 w-3.5 text-blue-400" />
    if (ext === "md" || ext === "txt") return <FileText className="h-3.5 w-3.5 text-white/40" />
    if (ext === "tsx" || ext === "jsx") return <FileCode className="h-3.5 w-3.5 text-blue-400" />
    if (ext === "ts" || ext === "js") return <FileCode className="h-3.5 w-3.5 text-yellow-400" />
    return <FileCode className="h-3.5 w-3.5 text-white/40" />
}

function buildTree(files: GeneratedFile[]): TreeNode[] {
    const root: TreeNode[] = []

    for (const file of files) {
        const segments = file.path.split("/")
        let current = root

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i]
            const isLast = i === segments.length - 1
            const existing = current.find((n) => n.name === segment)

            if (isLast) {
                if (!existing) {
                    current.push({
                        name: segment,
                        path: file.path,
                        isDir: false,
                        children: [],
                    })
                }
            } else {
                if (existing && existing.isDir) {
                    current = existing.children
                } else {
                    const dir: TreeNode = {
                        name: segment,
                        path: segments.slice(0, i + 1).join("/"),
                        isDir: true,
                        children: [],
                    }
                    current.push(dir)
                    current = dir.children
                }
            }
        }
    }

    // Sort: directories first, then files, both alphabetical
    const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
            return a.name.localeCompare(b.name)
        }).map((n) => ({
            ...n,
            children: sortNodes(n.children),
        }))
    }

    return sortNodes(root)
}

// ════════════════════════════════════════════════════
// TREE NODE COMPONENT
// ════════════════════════════════════════════════════

function TreeNodeView({
    node,
    depth,
    selectedFile,
    onSelectFile,
    expandedDirs,
    toggleDir,
}: {
    node: TreeNode
    depth: number
    selectedFile: string | null
    onSelectFile: (path: string) => void
    expandedDirs: Set<string>
    toggleDir: (path: string) => void
}) {
    const isExpanded = expandedDirs.has(node.path)
    const isSelected = !node.isDir && node.path === selectedFile

    return (
        <>
            <button
                className={`flex w-full items-center gap-1 px-2 py-0.5 text-[11px] hover:bg-white/5 transition-colors ${isSelected ? "bg-white/10 text-white" : "text-white/60"
                    }`}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => {
                    if (node.isDir) {
                        toggleDir(node.path)
                    } else {
                        onSelectFile(node.path)
                    }
                }}
            >
                {node.isDir ? (
                    <>
                        {isExpanded ? (
                            <ChevronDown className="h-3 w-3 shrink-0 text-white/30" />
                        ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 text-white/30" />
                        )}
                        {isExpanded ? (
                            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                        ) : (
                            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                        )}
                    </>
                ) : (
                    <>
                        <span className="w-3" />
                        {getFileIcon(node.path)}
                    </>
                )}
                <span className="truncate">{node.name}</span>
            </button>
            {node.isDir && isExpanded && (
                <>
                    {node.children.map((child) => (
                        <TreeNodeView
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            selectedFile={selectedFile}
                            onSelectFile={onSelectFile}
                            expandedDirs={expandedDirs}
                            toggleDir={toggleDir}
                        />
                    ))}
                </>
            )}
        </>
    )
}

// ════════════════════════════════════════════════════
// CODE EDITOR COMPONENT
// ════════════════════════════════════════════════════

export function CodeEditor({ files, selectedFile, onSelectFile, onFileChange }: CodeEditorProps) {
    const [copied, setCopied] = useState(false)
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
        // Auto-expand all directories
        const dirs = new Set<string>()
        for (const file of files) {
            const segments = file.path.split("/")
            for (let i = 1; i < segments.length; i++) {
                dirs.add(segments.slice(0, i).join("/"))
            }
        }
        return dirs
    })

    const tree = useMemo(() => buildTree(files), [files])
    const selectedContent = files.find((f) => f.path === selectedFile)?.content ?? ""
    const language = selectedFile ? getLanguage(selectedFile) : "typescript"

    // Update expanded dirs when files change
    useEffect(() => {
        setExpandedDirs((prev) => {
            const next = new Set(prev)
            for (const file of files) {
                const segments = file.path.split("/")
                for (let i = 1; i < segments.length; i++) {
                    next.add(segments.slice(0, i).join("/"))
                }
            }
            return next
        })
    }, [files])

    const toggleDir = (path: string) => {
        setExpandedDirs((prev) => {
            const next = new Set(prev)
            if (next.has(path)) {
                next.delete(path)
            } else {
                next.add(path)
            }
            return next
        })
    }

    const handleCopy = () => {
        if (selectedContent) {
            navigator.clipboard.writeText(selectedContent)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    if (files.length === 0) {
        return (
            <div className="flex h-full items-center justify-center bg-[#1d1f21] text-white/30 text-sm">
                Code will appear here once generation is complete…
            </div>
        )
    }

    return (
        <div className="flex h-full overflow-hidden bg-[#1d1f21]">
            {/* File tree sidebar */}
            <div className="w-48 shrink-0 border-r border-white/5 overflow-y-auto py-1.5 scrollbar-none">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/20">
                    Files
                </div>
                {tree.map((node) => (
                    <TreeNodeView
                        key={node.path}
                        node={node}
                        depth={0}
                        selectedFile={selectedFile}
                        onSelectFile={onSelectFile}
                        expandedDirs={expandedDirs}
                        toggleDir={toggleDir}
                    />
                ))}
            </div>

            {/* Code content */}
            <div className="flex-1 overflow-auto relative">
                {/* File name header + copy */}
                {selectedFile && (
                    <div className="sticky top-0 z-10 flex items-center justify-between bg-[#1d1f21]/90 backdrop-blur border-b border-white/5 px-4 py-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-white/50">
                            {getFileIcon(selectedFile)}
                            <span>{selectedFile}</span>
                        </div>
                        <button
                            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-white/40 hover:bg-white/5 hover:text-white/70 transition-colors"
                            onClick={handleCopy}
                        >
                            {copied ? (
                                <><Check className="h-3 w-3" /> Copied</>
                            ) : (
                                <><Copy className="h-3 w-3" /> Copy</>
                            )}
                        </button>
                    </div>
                )}

                {/* Monaco Editor */}
                <div className="flex-1 w-full h-[calc(100%-40px)] relative">
                    {selectedFile ? (
                        <Editor
                            height="100%"
                            language={language === 'tsx' || language === 'jsx' ? 'typescript' : language}
                            theme="vs-dark"
                            value={selectedContent}
                            onChange={(val) => {
                                if (val !== undefined && onFileChange) {
                                    onFileChange(selectedFile, val)
                                }
                            }}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                                wordWrap: "on",
                                scrollBeyondLastLine: false,
                                padding: { top: 16 }
                            }}
                            onMount={(editor, monaco) => {
                                // Intercept Ctrl+S / Cmd+S purely to prevent the browser's default Save dialog.
                                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                                    console.log("Auto-save triggered via shortcut")
                                })

                                // Configure Tailwind CSS autocomplete
                                try {
                                    import('monaco-tailwindcss').then(({ configureMonacoTailwindcss }) => {
                                        configureMonacoTailwindcss(monaco, {
                                            tailwindConfig: {
                                                content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
                                                theme: { extend: {} },
                                                plugins: []
                                            }
                                        })
                                    }).catch(console.error)
                                } catch (e) {
                                    console.error("Failed to inject monaco-tailwindcss", e)
                                }
                            }}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-white/20 text-sm">
                            Select a file to view
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
