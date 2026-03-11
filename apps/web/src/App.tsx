// ** import core packages
import { useEffect, useState } from "react"
import axios from "axios"

// ** import views
import { RemixStudioView } from "@/views/RemixStudioView"
import { PasswordView } from "@/views/PasswordView"

// ** import apis
import { apiRoutes } from "@/config/api"

/**
 * AI Studio App
 */
export function App() {
    const [jobId, setJobId] = useState<string | null>(null)
    const [projectId, setProjectId] = useState<string | null>(null)
    const [isChecking, setIsChecking] = useState(true)
    const [isAuthenticated, setIsAuthenticated] = useState(false)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        setJobId(params.get("jobId"))
        setProjectId(params.get("projectId"))

        // Check authentication status
        const checkAuth = async () => {
            try {
                const res = await axios.get(apiRoutes.authStatus())
                if (res.data.authenticated) {
                    setIsAuthenticated(true)
                }
            } catch (err) {
                console.error("Auth check failed", err)
            } finally {
                setIsChecking(false)
            }
        }
        checkAuth()
    }, [])

    const handleBack = () => {
        // Navigate back to the scraper app or project dashboard
        const url = import.meta.env.VITE_SCRAPER_URL ?? "/"
        window.location.href = url
    }

    if (isChecking) return null

    if (!isAuthenticated) {
        return <PasswordView onAuthenticated={() => setIsAuthenticated(true)} />
    }

    if (projectId) {
        return <RemixStudioView projectId={projectId} onBack={handleBack} />
    }

    if (jobId) {
        return <RemixStudioView jobId={jobId} onBack={handleBack} />
    }

    return (
        <div className="flex h-dvh w-full items-center justify-center bg-background text-foreground">
            <div className="text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF512F] via-[#F09819] to-[#DD2476] mx-auto flex items-center justify-center shadow-lg">
                    <div className="w-5 h-5 rounded-full bg-white/20" />
                </div>
                <p className="text-muted-foreground text-sm">
                    No job ID provided. Launch a remix from the{" "}
                    <a
                        href={import.meta.env.VITE_SCRAPER_URL ?? "/"}
                        className="text-foreground underline underline-offset-4 hover:opacity-80 transition-opacity"
                    >
                        scraper dashboard
                    </a>
                    .
                </p>
            </div>
        </div>
    )
}
