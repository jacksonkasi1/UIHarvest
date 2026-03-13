// ** import core packages
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

// ** import styles
import "./index.css"

// ** import lib
import { App } from "./App"

// ** import components
import { ThemeProvider } from "@/components/theme-provider"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

createRoot(root).render(
    <StrictMode>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="uiharvest-theme">
            <App />
        </ThemeProvider>
    </StrictMode>
)
