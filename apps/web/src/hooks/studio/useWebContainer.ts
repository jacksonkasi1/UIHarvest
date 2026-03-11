// ** import core packages
import { useState, useEffect, useCallback, useRef } from "react"
import type { Dispatch, SetStateAction } from "react"

// ** import lib
import type { ContainerEvent } from "@/lib/webcontainer"
import { preWarmContainer, mountAndRunWithSnapshot, resetContainer } from "@/lib/webcontainer"

// ** import types
import type { GeneratedFile, RemixProgressEvent } from "@/types/studio"

// ** import apis
import { apiRoutes } from "@/config/api"

export function useWebContainer(
    jobId: string, 
    setFiles: (files: GeneratedFile[]) => void, 
    setSelectedFile: (file: string | null) => void,
    setContainerReady: (ready: boolean) => void,
    containerReady: boolean,
    setContainerLogs: Dispatch<SetStateAction<string[]>>
) {
    const [isBootingContainer, setIsBootingContainer] = useState(false)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const [phase, setPhase] = useState("init")
    const [progress, setProgress] = useState(0)
    const [statusMessage, setStatusMessage] = useState("Starting remix…")
    const [projectName, setProjectName] = useState<string>("Elegant Portfolio")

    const eventSourceRef = useRef<EventSource | null>(null)
    const teardownRef = useRef<(() => void) | null>(null)
    const lastFilesRef = useRef<GeneratedFile[]>([])
    const isBootingRef = useRef(false)
    const hasBootedRef = useRef(false)

    const [hardReloadKey, setHardReloadKey] = useState(0)

    const onContainerEvent = useCallback((event: ContainerEvent) => {
        const logLine = `[${event.type}] ${event.message}`
        setContainerLogs((prev: string[]) => [...prev.slice(-200), logLine])

        if (event.type === "server-ready") {
            if (event.url) setPreviewUrl(event.url)
            hasBootedRef.current = true
            isBootingRef.current = false
            setContainerReady(true)
            setIsBootingContainer(false)
        }
        if (event.type === "error") {
            isBootingRef.current = false
            setError(event.message)
            setIsBootingContainer(false)
        }
    }, [setContainerLogs, setContainerReady, setPreviewUrl, setIsBootingContainer, setError])

    useEffect(() => {
        preWarmContainer(onContainerEvent).catch(console.error)
    }, [onContainerEvent])

    const bootContainer = useCallback(async (filesToMount: GeneratedFile[]) => {
        if (isBootingRef.current || hasBootedRef.current || containerReady) return

        isBootingRef.current = true
        setIsBootingContainer(true)
        lastFilesRef.current = filesToMount

        const result = await mountAndRunWithSnapshot(jobId, filesToMount, onContainerEvent)
        teardownRef.current = result.teardown

        if (result.previewUrl) {
            hasBootedRef.current = true
            setPreviewUrl(result.previewUrl)
            setContainerReady(true)
        }

        isBootingRef.current = false
        setIsBootingContainer(false)
    }, [containerReady, jobId, onContainerEvent, setPreviewUrl, setContainerReady, setIsBootingContainer])

    const handleHardReset = useCallback(async () => {
        console.log("[useWebContainer] Hard reset triggered")

        // Kill current dev server
        teardownRef.current?.()
        teardownRef.current = null

        // Reset UI state
        isBootingRef.current = true
        hasBootedRef.current = false
        setPreviewUrl(null)
        setContainerReady(false)
        setIsBootingContainer(true)
        setError(null)
        setContainerLogs([])

        try {
            // Clear caches + tear down WC instance
            await resetContainer()

            // Re-boot from scratch: pre-warm → mount → dev server
            await preWarmContainer(onContainerEvent)

            const filesToMount = lastFilesRef.current
            if (filesToMount.length > 0) {
                const result = await mountAndRunWithSnapshot(jobId, filesToMount, onContainerEvent)
                teardownRef.current = result.teardown

                if (result.previewUrl) {
                    setPreviewUrl(result.previewUrl)
                    setContainerReady(true)
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            isBootingRef.current = false
            setError(`Hard reset failed: ${message}`)
        } finally {
            isBootingRef.current = false
            setIsBootingContainer(false)
        }
    }, [jobId, onContainerEvent, setContainerReady, setContainerLogs, setPreviewUrl, setIsBootingContainer, setError])

    const fetchFiles = async () => {
        if (jobId === "__noop__") return
        try {
            const res = await fetch(apiRoutes.remixFiles(jobId), { credentials: "include" })
            if (res.ok) {
                const data = await res.json()
                if (data.job?.projectName) {
                    setProjectName(data.job.projectName)
                }
                const fetchedFiles: GeneratedFile[] = data.files ?? []
                setFiles(fetchedFiles)
                const appFile = fetchedFiles.find((f) => f.path === "src/App.tsx")
                if (appFile) setSelectedFile(appFile.path)
                if (fetchedFiles.length > 0) bootContainer(fetchedFiles)
            }
        } catch { }
    }

    useEffect(() => {
        if (jobId === "__noop__") return

        const es = new EventSource(apiRoutes.remixProgress(jobId), { withCredentials: true })
        eventSourceRef.current = es

        es.onmessage = (e) => {
            try {
                const event: RemixProgressEvent = JSON.parse(e.data)
                setPhase(event.phase)
                setStatusMessage(event.message)
                if (event.progress !== undefined) setProgress(event.progress)
                if (event.error) setError(event.error)
                if (event.phase === "ready") fetchFiles()
            } catch { }
        }

        es.onerror = () => es.close()

        return () => {
            es.close()
            teardownRef.current?.()
            isBootingRef.current = false
            hasBootedRef.current = false
        }
    }, [jobId])

    return {
        containerReady,
        isBootingContainer,
        previewUrl,
        error,
        setError,
        phase,
        progress,
        statusMessage,
        projectName,
        setProjectName,
        hardReloadKey,
        setHardReloadKey,
        handleHardReset
    }
}
