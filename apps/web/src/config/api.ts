// AI Studio API routes
// In dev: proxied via vite to apps/server (http://localhost:3334)
// In prod: points to apps/server deployment URL (set via VITE_API_URL)

const API_BASE = import.meta.env.VITE_API_URL ?? ""

export const apiRoutes = {
  // Scraper-originated job routes (bootstrap progress + initial files)
  remixFiles: (jobId: string) => `${API_BASE}/api/remix/${jobId}/files`,
  remixProgress: (jobId: string) => `${API_BASE}/api/remix/${jobId}/progress`,

  // Studio chat (apps/server)
  chat: (jobId: string) => `${API_BASE}/api/chat/${jobId}`,
  chatFiles: (jobId: string) => `${API_BASE}/api/chat/${jobId}/files`,
}
