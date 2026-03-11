const API_BASE = import.meta.env.VITE_API_URL ?? ""

export const getChatUrl = (jobId: string): string => `${API_BASE}/api/chat/${jobId}`
