import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/output": {
        target: "http://localhost:3333",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3333",
        changeOrigin: true,
      },
    },
  },
})
