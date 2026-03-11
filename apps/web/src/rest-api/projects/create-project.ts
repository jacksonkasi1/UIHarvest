// ** import config
import axiosInstance from "@/rest-api/config/axios"

interface CreateProjectRequest {
  name: string
  initialPrompt?: string
}

interface CreateProjectResponse {
  projectId: string
}

export const createProject = async (
  data: CreateProjectRequest,
): Promise<CreateProjectResponse> => {
  const response = await axiosInstance.post<CreateProjectResponse>(
    "/api/projects",
    data,
  )

  return response.data
}
