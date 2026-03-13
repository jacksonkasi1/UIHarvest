// ** import core packages
import { useEffect, useState } from "react"
import axios from "axios"

// ** import views
import { RemixStudioView } from "@/views/RemixStudioView"
import { NewProjectPage } from "@/views/NewProjectPage"
import { PasswordView } from "@/views/PasswordView"

// ** import apis
import { apiRoutes } from "@/config/api"

/**
 * AI Studio App
 */
export function App() {
    const [projectId, setProjectId] = useState<string | null>(null)
    const [isChecking, setIsChecking] = useState(true)
    const [isAuthenticated, setIsAuthenticated] = useState(false)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
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

    const openProject = (id: string) => {
        setProjectId(id)
        const url = new URL(window.location.href)
        url.searchParams.set("projectId", id)
        window.history.replaceState({}, "", url)
    }

    const handleBack = () => {
        setProjectId(null)
        const url = new URL(window.location.href)
        url.searchParams.delete("projectId")
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
    }

    if (isChecking) return null

    if (!isAuthenticated) {
        return <PasswordView onAuthenticated={() => setIsAuthenticated(true)} />
    }

    if (projectId) {
        return <RemixStudioView projectId={projectId} onBack={handleBack} />
    }

    return <NewProjectPage onProjectCreated={openProject} />
}
