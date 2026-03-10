const API_BASE = ""

export const apiRoutes = {
  remixFiles: (jobId: string) => `${API_BASE}/api/remix/${jobId}/files`,
  remixProgress: (jobId: string) => `${API_BASE}/api/remix/${jobId}/progress`,
}
