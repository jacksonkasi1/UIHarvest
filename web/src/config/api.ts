const API_BASE = ""

export const apiRoutes = {
  remixChat: (jobId: string) => `${API_BASE}/api/remix/${jobId}/chat`,
  remixFiles: (jobId: string) => `${API_BASE}/api/remix/${jobId}/files`,
  remixProgress: (jobId: string) => `${API_BASE}/api/remix/${jobId}/progress`,
}
