// ** import lib
import { WebContainer } from "@webcontainer/api"

// ** import types
import type { FileSystemTree } from "@webcontainer/api"

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

export interface GeneratedFile {
    path: string
    content: string
}

export interface ContainerEvent {
    type: "boot" | "mount" | "install" | "install-output" | "dev-start" | "server-ready" | "error" | "terminal"
    message: string
    url?: string
    port?: number
}

export type ContainerEventHandler = (event: ContainerEvent) => void

// ════════════════════════════════════════════════════
// WEBCONTAINER SERVICE (SINGLETON)
// ════════════════════════════════════════════════════

let _instance: WebContainer | null = null
let _bootPromise: Promise<WebContainer> | null = null

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
 * Convert flat file list (path→content) into WebContainer's nested FileSystemTree.
 *
 * Input:  [{ path: "src/App.tsx", content: "..." }]
 * Output: { src: { directory: { "App.tsx": { file: { contents: "..." } } } } }
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
                // It's a file
                current[segment] = {
                    file: { contents: file.content },
                }
            } else {
                // It's a directory
                if (!current[segment]) {
                    current[segment] = { directory: {} }
                }
                current = current[segment].directory
            }
        }
    }

    return tree
}

/**
 * Mount generated files into the WebContainer, install deps with bun, and start dev server.
 * Returns a cleanup function to tear down the listener.
 */
export async function mountAndRun(
    files: GeneratedFile[],
    onEvent: ContainerEventHandler
): Promise<{ previewUrl: string | null; teardown: () => void }> {
    let _teardown: (() => void) | null = null

    try {
        // 1. Boot
        onEvent({ type: "boot", message: "Booting WebContainer…" })
        const wc = await getInstance()
        onEvent({ type: "boot", message: "WebContainer ready" })

        // 2. Mount files
        onEvent({ type: "mount", message: `Mounting ${files.length} files…` })
        const tree = filesToTree(files)
        await wc.mount(tree)
        onEvent({ type: "mount", message: "Files mounted" })

        // 3. Install dependencies with npm
        onEvent({ type: "install", message: "Installing dependencies (npm install)…" })

        const installProcess = await wc.spawn("npm", ["install", "--no-color", "--no-progress"])

        // Pipe install output
        const installOutputReader = installProcess.output.getReader()
        const decoder = new TextDecoder()
            ; (async () => {
                try {
                    while (true) {
                        const { done, value } = await installOutputReader.read()
                        if (done) break
                        const text = typeof value === "string" ? value : decoder.decode(value)
                        const cleanText = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "").trim()
                        if (cleanText.length > 0) {
                            onEvent({ type: "install-output", message: cleanText })
                        }
                    }
                } catch {
                    // Stream closed
                }
            })()

        const installExitCode = await installProcess.exit
        if (installExitCode !== 0) {
            throw new Error(`npm install failed with exit code ${installExitCode}`)
        }
        onEvent({ type: "install", message: "Dependencies installed" })

        // 4. Start dev server
        onEvent({ type: "dev-start", message: "Starting dev server (npm run dev)…" })
        const devProcess = await wc.spawn("npm", ["run", "dev"])

        // Pipe dev server output
        const devOutputReader = devProcess.output.getReader()
            ; (async () => {
                try {
                    while (true) {
                        const { done, value } = await devOutputReader.read()
                        if (done) break
                        const text = typeof value === "string" ? value : decoder.decode(value)
                        const cleanText = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "").trim()
                        if (cleanText.length > 0) {
                            onEvent({ type: "terminal", message: cleanText })
                        }
                    }
                } catch {
                    // Stream closed
                }
            })()

        // 5. Wait for server-ready
        const previewUrl = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Dev server timed out after 30s"))
            }, 30_000)

            wc.on("server-ready", (port, url) => {
                clearTimeout(timeout)
                onEvent({ type: "server-ready", message: `Server ready on port ${port}`, url, port })
                resolve(url)
            })

            _teardown = () => {
                clearTimeout(timeout)
                devProcess.kill()
            }
        })

        return {
            previewUrl,
            teardown: () => {
                _teardown?.()
                devProcess.kill()
            },
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        onEvent({ type: "error", message })
        return {
            previewUrl: null,
            teardown: () => _teardown?.(),
        }
    }
}

/**
 * Write updated files to the already-running WebContainer.
 * Does NOT reinstall deps — just overwrites changed files.
 */
export async function writeFiles(files: GeneratedFile[], onEvent?: ContainerEventHandler): Promise<void> {
    const wc = await getInstance()

    for (const file of files) {
        // Ensure parent directories exist
        const dir = file.path.substring(0, file.path.lastIndexOf("/"))
        if (dir) {
            await wc.fs.mkdir(dir, { recursive: true })
        }
        await wc.fs.writeFile(file.path, file.content)
    }

    onEvent?.({ type: "mount", message: `Updated ${files.length} files` })
}

/**
 * Install additional packages into the running WebContainer.
 * Runs `npm install <packages>` and reports progress via onEvent.
 */
export async function installPackages(
    packages: string[],
    onEvent?: ContainerEventHandler
): Promise<boolean> {
    if (packages.length === 0) return true

    try {
        const wc = await getInstance()
        onEvent?.({ type: "install", message: `Installing ${packages.join(", ")}…` })

        const installProcess = await wc.spawn("npm", ["install", "--no-color", "--no-progress", ...packages])

        const decoder = new TextDecoder()
        const outputReader = installProcess.output.getReader()
            ; (async () => {
                try {
                    while (true) {
                        const { done, value } = await outputReader.read()
                        if (done) break
                        const text = typeof value === "string" ? value : decoder.decode(value)
                        const cleanText = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "").trim()
                        if (cleanText.length > 0) {
                            onEvent?.({ type: "install-output", message: cleanText })
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
    }
}

/**
 * Check if WebContainer is currently booted.
 */
export function isBooted(): boolean {
    return _instance !== null
}

/**
 * Teardown — only useful for testing or full reset.
 */
export async function teardown(): Promise<void> {
    if (_instance) {
        _instance.teardown()
        _instance = null
        _bootPromise = null
    }
}
