// ** import config
import axiosInstance from "@/rest-api/config/axios"

interface LoginRequest {
  password: string
}

interface LoginResponse {
  success: boolean
  token?: string
}

export const login = async (data: LoginRequest): Promise<LoginResponse> => {
  const response = await axiosInstance.post<LoginResponse>("/api/auth/login", data)

  return response.data
}
