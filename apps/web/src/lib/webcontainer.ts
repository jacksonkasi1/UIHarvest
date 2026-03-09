// ** import lib
import { WebContainer } from "@webcontainer/api"

// ** import types
import type { FileSystemTree } from "@webcontainer/api"

// ** import lib
import {
    saveSnapshot,
    loadSnapshot,
    fetchSnapshotVersion,
    loadBaseSnapshot,
    saveBaseSnapshot,
} from "./snapshot-cache"

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

export interface GeneratedFile {
    path: string
    content: string
}

export interface ContainerEvent {
    type: "boot" | "mount" | "install" | "install-output" | "dev-start" | "server-ready" | "error" | "terminal" | "cache-hit" | "cache-miss" | "snapshot-save"
    message: string
    url?: string
    port?: number
}

export interface FileWriteResult {
    path: string
    success: boolean
    error?: string
}

export type ContainerEventHandler = (event: ContainerEvent) => void

// ════════════════════════════════════════════════════
// WEBCONTAINER SERVICE (SINGLETON)
// ════════════════════════════════════════════════════

let _instance: WebContainer | null = null
let _bootPromise: Promise<WebContainer> | null = null
let _preWarmPromise: Promise<void> | null = null
let _preWarmed = false
let _snapshotVersion: string = "unknown"

// Mutex to serialize package installations
let _installMutex: Promise<any> = Promise.resolve(true)

async function _ensureExecutablePermissions(wc: WebContainer): Promise<void> {
    const executablePaths = [
        "node_modules/.bin/vite",
        "node_modules/vite/bin/vite.js",
    ]

    for (const executablePath of executablePaths) {
        try {
            const chmodProcess = await wc.spawn("chmod", ["+x", executablePath])
            await chmodProcess.exit
        } catch (err) {
            console.warn(`[webcontainer] Could not chmod ${executablePath}:`, err)
        }
    }
}

/**
 * Boot or return the existing WebContainer instance.
 * WebContainer.boot() must only be called once per page.
 */
async function getInstance(): Promise<WebContainer> {
    if (_instance) return _instance
    if (_bootPromise) return _bootPromise

    _bootPromise = WebContainer.boot().then((wc) => {
        _instance = wc
        return wc
    })

    return _bootPromise
}

/**
 * Convert flat file list into WebContainer's nested FileSystemTree.
 */
function filesToTree(files: GeneratedFile[]): FileSystemTree {
    const tree: FileSystemTree = {}

    for (const file of files) {
        const segments = file.path.split("/")
        let current: any = tree

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i]
            const isLast = i === segments.length - 1

            if (isLast) {
                current[segment] = {
                    file: { contents: file.content },
                }
            } else {
                if (!current[segment]) {
                    current[segment] = { directory: {} }
                }
                current = current[segment].directory
            }
        }
    }

    return tree
}

// ════════════════════════════════════════════════════
// PRE-WARM: Boot WC + mount pre-built snapshot
// ════════════════════════════════════════════════════

/**
 * Fetch the pre-built base snapshot binary.
 *
 * Priority:
 *   1. IndexedDB cache (instant, ~0ms)
 *   2. /base-snapshot.bin (HTTP fetch, ~1-3s from CDN/static)
 *
 * The binary already contains node_modules — NO npm install needed.
 */
async function _fetchBaseSnapshot(
    version: string,
    onEvent: ContainerEventHandler
): Promise<Uint8Array> {
    // 1. Try IndexedDB cache
    onEvent({ type: "boot", message: "Checking cache\u2026" })
    const cached = await loadBaseSnapshot(version)
    if (cached) {
        const sizeMB = (cached.byteLength / 1024 / 1024).toFixed(1)
        onEvent({ type: "cache-hit", message: `Cache hit! Loaded ${sizeMB}\u00a0MB from cache (instant)` })
        return cached
    }

    // 2. Fetch from server / CDN
    onEvent({ type: "cache-miss", message: "No cache found, downloading base snapshot\u2026" })
    const res = await fetch("/base-snapshot.bin")
    if (!res.ok) {
        throw new Error(`Failed to fetch base snapshot: ${res.status} ${res.statusText}`)
    }

    const buffer = await res.arrayBuffer()
    const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(1)
    onEvent({ type: "install", message: `Downloaded base snapshot (${sizeMB}\u00a0MB)` })

    // Save to IndexedDB in background so next visit is instant
    saveBaseSnapshot(version, buffer).catch(() => {/* no-op */})

    return new Uint8Array(buffer)
}

/**
 * Pre-warm the WebContainer by booting and mounting the pre-built base snapshot.
 * Call this on page mount BEFORE files arrive from AI.
 *
 * This replaces the old approach of running `npm install` at runtime.
 * The base-snapshot.bin is generated once server-side by:
 *   bun run scripts/generate-base-snapshot.ts
 */
export async function preWarmContainer(
    onEvent: ContainerEventHandler
): Promise<void> {
    if (_preWarmPromise) return _preWarmPromise
    if (_preWarmed) return

    _preWarmPromise = _doPreWarm(onEvent)
    return _preWarmPromise
}

async function _doPreWarm(onEvent: ContainerEventHandler): Promise<void> {
    try {
        // Kick off both boot and version fetch in parallel
        const versionPromise = fetchSnapshotVersion()

        onEvent({ type: "boot", message: "Booting WebContainer\u2026" })
        const [wc, version] = await Promise.all([getInstance(), versionPromise])
        _snapshotVersion = version
        onEvent({ type: "boot", message: "WebContainer ready" })

        // Fetch pre-built snapshot (node_modules already included)
        const snapshotData = await _fetchBaseSnapshot(version, onEvent)

        onEvent({ type: "mount", message: "Mounting base snapshot\u2026" })
        await wc.mount(snapshotData)
        onEvent({ type: "mount", message: "Base snapshot mounted (no npm install needed)" })

        _preWarmed = true
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        onEvent({ type: "error", message: `Pre-warm failed: ${message}` })
        _preWarmPromise = null
    }
}

// ════════════════════════════════════════════════════
// SNAPSHOT-AWARE BOOT
// ════════════════════════════════════════════════════

/**
 * Boot the WebContainer with snapshot support.
 *
 * Priority:
 *   1. Per-job IndexedDB cache   → instant restore (repeat visits)
 *   2. Pre-warmed base snapshot  → mount user files, start dev server
 *
 * NO npm install ever runs in the browser.
 */
export async function mountAndRunWithSnapshot(
    jobId: string,
    files: GeneratedFile[],
    onEvent: ContainerEventHandler
): Promise<{ previewUrl: string | null; teardown: () => void }> {
    try {
        const version = _snapshotVersion !== "unknown" ? _snapshotVersion : await fetchSnapshotVersion()

        // ── Priority 1: per-job IndexedDB cache (full state with user files) ──
        onEvent({ type: "boot", message: "Checking cache\u2026" })
        const cachedSnapshot = await loadSnapshot(jobId, version)

        if (cachedSnapshot) {
            onEvent({ type: "cache-hit", message: "Restoring from cache\u2026 (instant)" })

            const wc = await getInstance()

            // Wait briefly to ensure any in-flight mounts settle
            await new Promise((resolve) => setTimeout(resolve, 150))

            await wc.mount(cachedSnapshot)
            onEvent({ type: "mount", message: "Snapshot restored" })

            await _ensureExecutablePermissions(wc)

            // Overlay with latest source files
            const sourceFiles = files.filter((f) => !f.path.startsWith("node_modules"))
            if (sourceFiles.length > 0) {
                const tree = filesToTree(sourceFiles)
                await wc.mount(tree)
                onEvent({ type: "mount", message: `Updated ${sourceFiles.length} source files` })
            }

            return await _startDevServer(wc, onEvent, jobId, version)
        }

        // ── Priority 2: pre-warmed base snapshot + user files ──
        onEvent({ type: "cache-miss", message: "No job cache, using pre-warmed base\u2026" })

        // Ensure pre-warm is complete (base snapshot mounted)
        if (!_preWarmed) {
            onEvent({ type: "install", message: "Waiting for base snapshot\u2026" })
            if (_preWarmPromise) {
                await _preWarmPromise
            } else {
                await preWarmContainer(onEvent)
            }
        }

        const wc = await getInstance()

        // Overlay user-generated source files on top of the base snapshot
        const sourceFiles = files.filter((f) => !f.path.startsWith("node_modules"))
        onEvent({ type: "mount", message: `Mounting ${sourceFiles.length} files\u2026` })
        const tree = filesToTree(sourceFiles)
        await wc.mount(tree)
        onEvent({ type: "mount", message: "Files mounted" })

        return await _startDevServer(wc, onEvent, jobId, version)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        onEvent({ type: "error", message })
        return {
            previewUrl: null,
            teardown: () => { },
        }
    }
}

/**
 * Start the Vite dev server and wait for server-ready.
 * After server-ready, export snapshot to IndexedDB for next visit.
 */
async function _startDevServer(
    wc: WebContainer,
    onEvent: ContainerEventHandler,
    jobId: string,
    version: string
): Promise<{ previewUrl: string | null; teardown: () => void }> {
    await _ensureExecutablePermissions(wc)
    onEvent({ type: "dev-start", message: "Starting dev server (npm run dev)\u2026" })
    const devProcess = await wc.spawn("npm", ["run", "dev"])

    const decoder = new TextDecoder()
    const devOutputReader = devProcess.output.getReader()
    let buffer = ""
    let lastEmit = Date.now()

    void (async () => {
        try {
            while (true) {
                const { done, value } = await devOutputReader.read()
                if (done) {
                    if (buffer.trim().length > 0) onEvent({ type: "terminal", message: buffer.trim() })
                    break
                }
                const text = typeof value === "string" ? value : decoder.decode(value)
                const cleanText = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
                buffer += cleanText

                if (Date.now() - lastEmit > 50) {
                    const lines = buffer.split("\n")
                    buffer = lines.pop() || ""
                    for (const line of lines) {
                        if (line.trim().length > 0) onEvent({ type: "terminal", message: line.trim() })
                    }
                    lastEmit = Date.now()
                }
            }
        } catch {
            // Stream closed
        }
    })()

    // Wait for server-ready with 120s timeout
    const previewUrl = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
            onEvent({ type: "error", message: "Dev server timed out after 120s" })
            reject(new Error("Dev server timed out after 120s"))
        }, 120_000)

        wc.on("server-ready", (port: number, url: string) => {
            clearTimeout(timeout)
            onEvent({ type: "server-ready", message: `Server ready on port ${port}`, url, port })
            resolve(url)
        })

        // Catch process crashes before server-ready
        devProcess.exit.then((code) => {
            if (code !== 0) {
                clearTimeout(timeout)
                onEvent({ type: "error", message: `Vite server crashed (exit code ${code}). Try editing the code to fix syntax errors.` })
                reject(new Error(`Vite server crashed (exit code ${code})`))
            }
        }).catch(() => {})
    })

    // Save per-job snapshot to IndexedDB in background (for instant restore next visit)
    _saveSnapshotInBackground(wc, jobId, version, onEvent)

    return {
        previewUrl,
        teardown: () => {
            devProcess.kill()
        },
    }
}

async function _saveSnapshotInBackground(
    wc: WebContainer,
    jobId: string,
    version: string,
    onEvent: ContainerEventHandler
): Promise<void> {
    try {
        onEvent({ type: "snapshot-save", message: "Caching for instant restore\u2026" })
        const snapshotData = await wc.export(".", { format: "binary" } as any) as unknown as Uint8Array
        await saveSnapshot(jobId, snapshotData, version)
        onEvent({ type: "snapshot-save", message: "Cached for next visit \u2713" })
    } catch (err) {
        console.warn("[webcontainer] Failed to save snapshot:", (err as Error).message)
    }
}

// ════════════════════════════════════════════════════
// FILE / PACKAGE UTILITIES
// ════════════════════════════════════════════════════

/**
 * Write updated files to the already-running WebContainer.
 */
export async function writeFiles(files: GeneratedFile[], onEvent?: ContainerEventHandler): Promise<void> {
    const results = await updateFiles(files, onEvent)
    const failed = results.filter((result) => !result.success)
    if (failed.length > 0) {
        throw new Error(`Failed to update ${failed.length} files`)
    }
}

async function ensureParentDirs(wc: WebContainer, filePath: string): Promise<void> {
    const normalized = filePath.replace(/^\/+/, "")
    const parts = normalized.split("/")
    if (parts.length <= 1) return

    let current = ""
    for (let i = 0; i < parts.length - 1; i++) {
        const segment = parts[i]
        if (!segment) continue
        current = current ? `${current}/${segment}` : segment
        try {
            await wc.fs.mkdir(current)
        } catch {
            // Directory likely already exists.
        }
    }
}

export async function updateFiles(
    files: GeneratedFile[],
    onEvent?: ContainerEventHandler
): Promise<FileWriteResult[]> {
    const wc = await getInstance()
    const results: FileWriteResult[] = []

    for (const file of files) {
        try {
            await ensureParentDirs(wc, file.path)
            await wc.fs.writeFile(file.path, file.content)
            results.push({ path: file.path, success: true })
            onEvent?.({ type: "mount", message: `Updated ${file.path}` })
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            results.push({ path: file.path, success: false, error: message })
            onEvent?.({ type: "error", message: `Failed to update ${file.path}: ${message}` })
        }
    }

    const successCount = results.filter((result) => result.success).length
    const failureCount = results.length - successCount
    onEvent?.({
        type: failureCount > 0 ? "error" : "mount",
        message:
            failureCount > 0
                ? `Updated ${successCount}/${results.length} files (${failureCount} failed)`
                : `Updated ${successCount} files`,
    })

    return results
}

/**
 * Install additional packages into the running WebContainer.
 */
export async function installPackages(
    packages: string[],
    onEvent?: ContainerEventHandler
): Promise<boolean> {
    if (packages.length === 0) return true

    // Wait for any ongoing install to finish before starting a new one
    const previousMutex = _installMutex
    let releaseMutex!: () => void
    _installMutex = new Promise<void>(resolve => { releaseMutex = resolve })
    await previousMutex

    try {
        const wc = await getInstance()
        onEvent?.({ type: "install", message: `Installing ${packages.join(", ")}\u2026` })

        const installProcess = await wc.spawn("npm", [
            "install", "--no-color", "--no-progress", ...packages,
        ])

        const decoder = new TextDecoder()
        const outputReader = installProcess.output.getReader()
        let buffer = ""
        let lastEmit = Date.now()

        void (async () => {
            try {
                while (true) {
                    const { done, value } = await outputReader.read()
                    if (done) {
                        if (buffer.trim().length > 0) onEvent?.({ type: "install-output", message: buffer.trim() })
                        break
                    }
                    const text = typeof value === "string" ? value : decoder.decode(value)
                    const cleanText = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
                    buffer += cleanText

                    if (Date.now() - lastEmit > 100) {
                        const lines = buffer.split("\n")
                        buffer = lines.pop() || ""
                        for (const line of lines) {
                            if (line.trim().length > 0) onEvent?.({ type: "install-output", message: line.trim() })
                        }
                        lastEmit = Date.now()
                    }
                }
            } catch {
                // Stream closed
            }
        })()

        const exitCode = await installProcess.exit
        if (exitCode !== 0) {
            onEvent?.({ type: "error", message: `Package install failed (exit ${exitCode})` })
            return false
        }

        onEvent?.({ type: "install", message: `Installed ${packages.join(", ")}` })
        return true
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        onEvent?.({ type: "error", message: `Package install error: ${message}` })
        return false
    } finally {
        releaseMutex!()
    }
}

// ════════════════════════════════════════════════════
// STATUS HELPERS
// ════════════════════════════════════════════════════

export function isBooted(): boolean {
    return _instance !== null
}

export function isPreWarmed(): boolean {
    return _preWarmed
}

export async function teardown(): Promise<void> {
    if (_instance) {
        _instance.teardown()
        _instance = null
        _bootPromise = null
        _preWarmPromise = null
        _preWarmed = false
    }
}
