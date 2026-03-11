// ** import core packages
import axios from "axios"

const API_BASE = import.meta.env.VITE_API_URL ?? ""

const axiosInstance = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
})

export default axiosInstance
