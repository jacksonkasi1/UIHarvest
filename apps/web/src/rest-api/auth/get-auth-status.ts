// ** import config
import axiosInstance from "@/rest-api/config/axios"

interface AuthStatusResponse {
  requiresPassword: boolean
  authenticated: boolean
}

export const getAuthStatus = async (): Promise<AuthStatusResponse> => {
  const response = await axiosInstance.get<AuthStatusResponse>("/api/auth/status")

  return response.data
}
