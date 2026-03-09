// ** import core packages
import { useEffect, useState } from "react"

// ** import views
import { RemixStudioView } from "@/views/RemixStudioView"

/**
 * AI Studio App
 *
 * Routes to RemixStudioView using ?jobId=<id> query parameter.
 * When a jobId is present in the URL the studio is shown directly.
 * Without a jobId the user sees a placeholder directing them back to
 * the scraper app.
 *
 * In production the scraper app redirects to this app via VITE_STUDIO_URL
 * with a jobId query param.
 */
export function App() {
    const [jobId, setJobId] = useState<string | null>(null)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const id = params.get("jobId")
        setJobId(id)
    }, [])

    const handleBack = () => {
        // Navigate back to the scraper app
        const scraperUrl = import.meta.env.VITE_SCRAPER_URL ?? "/"
        window.location.href = scraperUrl
    }

    if (!jobId) {
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

    return <RemixStudioView jobId={jobId} onBack={handleBack} />
}
