import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const serverTarget = process.env.VITE_SERVER_URL ?? "http://localhost:3334";
// https://vite.dev/config/
export default defineConfig({
    define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "development"),
    },
    plugins: [
        react(),
        tailwindcss(),
        // WebContainer requires cross-origin isolation (SharedArrayBuffer)
        {
            name: "cross-origin-isolation",
            configureServer(server) {
                server.middlewares.use((_req, res, next) => {
                    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
                    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
                    next();
                });
            },
        },
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        proxy: {
            "/api": {
                target: serverTarget,
                changeOrigin: true,
            },
        },
    },
    // Required for WebContainer (SharedArrayBuffer needs cross-origin isolation)
    preview: {
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        },
    },
});
