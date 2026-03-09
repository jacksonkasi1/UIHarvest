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

export type RightPanel = "preview" | "code" | "terminal"
