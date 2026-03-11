// ** import config
import axiosInstance from "@/rest-api/config/axios"

interface ProjectMeta {
  id: string
  status: string
  phase: string
  createdAt: number
  updatedAt: number
  initialPrompt?: string
  targetUrl?: string
  referenceUrl?: string
}

interface GetProjectsResponse {
  projects: ProjectMeta[]
}

export const getProjects = async (): Promise<GetProjectsResponse> => {
  const response = await axiosInstance.get<GetProjectsResponse>("/api/projects")

  return response.data
}
