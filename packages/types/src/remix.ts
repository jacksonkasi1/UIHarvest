export interface GeneratedFile {
  path: string
  content: string
}

export type RemixPhase =
  | "queued"
  | "extracting"
  | "analyzing"
  | "generating"
  | "ready"
  | "error"

export interface RemixProgressEvent {
  phase: RemixPhase
  message: string
  progress?: number
  error?: string
}
