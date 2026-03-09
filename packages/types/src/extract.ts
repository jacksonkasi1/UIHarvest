export interface ProgressEvent {
  phase: string
  message: string
  progress?: number
  error?: string
}

export interface ExtractionResult {
  url: string
  timestamp: string
}
