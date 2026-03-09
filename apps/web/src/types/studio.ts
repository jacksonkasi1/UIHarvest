// ** import types

export interface RemixProgressEvent {
    phase: string
    message: string
    progress?: number
    error?: string
}

export interface GeneratedFile {
    path: string
    content: string
}

export interface ImageAttachment {
    data: string
    mimeType: string
    preview: string
    name: string
}

export interface ChatEvent {
    type: "thinking" | "text" | "tool_start" | "tool_end" | "done" | "error"
    content?: string
    partial?: boolean
    tool?: string
    message?: string
    files?: GeneratedFile[]
    summary?: string
    error?: string
    packages?: string[]
}

export interface ToolExecution {
    tool: string
    status: "running" | "complete" | "error"
    message: string
    summary?: string
    filesChanged?: number
}

export interface ChatMessage {
    id: string
    role: "user" | "assistant"
    content: string
    images?: ImageAttachment[]
    timestamp: number
    status?: "pending" | "streaming" | "done"
    toolExecutions?: ToolExecution[]
}

export type RightPanel = "preview" | "code" | "terminal"

export type ViewportSize = "desktop" | "tablet" | "mobile"
