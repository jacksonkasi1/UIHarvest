import { useState, useEffect, useCallback, useRef } from "react"
import type { Dispatch, SetStateAction } from "react"
import type { ContainerEvent } from "@/lib/webcontainer"
import { preWarmContainer, mountAndRunWithSnapshot } from "@/lib/webcontainer"
import type { GeneratedFile, RemixProgressEvent } from "@/types/studio"
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

    const eventSourceRef = useRef<EventSource | null>(null)
    const teardownRef = useRef<(() => void) | null>(null)

    const onContainerEvent = useCallback((event: ContainerEvent) => {
        const logLine = `[${event.type}] ${event.message}`
        setContainerLogs((prev: string[]) => [...prev.slice(-200), logLine])

        if (event.type === "server-ready" && event.url) {
            setPreviewUrl(event.url)
            setContainerReady(true)
            setIsBootingContainer(false)
        }
        if (event.type === "error") {
            setError(event.message)
            setIsBootingContainer(false)
        }
    }, [setContainerLogs, setContainerReady])

    useEffect(() => {
        preWarmContainer(onContainerEvent).catch(console.error)
    }, [onContainerEvent])

    const bootContainer = useCallback(async (filesToMount: GeneratedFile[]) => {
        if (isBootingContainer || containerReady) return
        setIsBootingContainer(true)

        const result = await mountAndRunWithSnapshot(jobId, filesToMount, onContainerEvent)
        teardownRef.current = result.teardown

        if (result.previewUrl) {
            setPreviewUrl(result.previewUrl)
            setContainerReady(true)
        }
        setIsBootingContainer(false)
    }, [isBootingContainer, containerReady, jobId, onContainerEvent])

    const fetchFiles = async () => {
        try {
            const res = await fetch(apiRoutes.remixFiles(jobId))
            if (res.ok) {
                const data = await res.json()
                const fetchedFiles: GeneratedFile[] = data.files ?? []
                setFiles(fetchedFiles)
                const appFile = fetchedFiles.find((f) => f.path === "src/App.tsx")
                if (appFile) setSelectedFile(appFile.path)
                if (fetchedFiles.length > 0) bootContainer(fetchedFiles)
            }
        } catch { }
    }

    useEffect(() => {
        const es = new EventSource(apiRoutes.remixProgress(jobId))
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
    }
}
