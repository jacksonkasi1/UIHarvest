import type { GeneratedFile } from "./remix"

export type ChatEventType =
  | "thinking"
  | "text"
  | "tool_start"
  | "tool_end"
  | "done"
  | "error"

export interface ChatEvent {
  type: ChatEventType
  content?: string
  partial?: boolean
  tool?: string
  message?: string
  files?: GeneratedFile[]
  summary?: string
  error?: string
  packages?: string[]
}

export interface ImageAttachment {
  data: string
  mimeType: string
  preview: string
  name: string
}

export interface ToolExecution {
  tool: string
  status: "running" | "complete" | "error"
  message: string
  summary?: string
  filesChanged?: number
}

export interface StudioChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  images?: ImageAttachment[]
  timestamp: number
  status?: "pending" | "streaming" | "done"
  toolExecutions?: ToolExecution[]
}

export type RightPanel = "preview" | "code" | "terminal"
