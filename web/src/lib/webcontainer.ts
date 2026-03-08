// ** import lib
import { WebContainer } from "@webcontainer/api"

// ** import types
import type { FileSystemTree } from "@webcontainer/api"

// ** import lib
import {
    saveSnapshot,
    loadSnapshot,
    fetchSnapshotVersion,
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

export type ContainerEventHandler = (event: ContainerEvent) => void

// ════════════════════════════════════════════════════
// WEBCONTAINER SERVICE (SINGLETON)
// ════════════════════════════════════════════════════

let _instance: WebContainer | null = null
let _bootPromise: Promise<WebContainer> | null = null
let _preWarmPromise: Promise<void> | null = null
let _preWarmed = false
let _snapshotVersion: string = "unknown"

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
// PRE-WARM: Boot WC + install base deps immediately
// ════════════════════════════════════════════════════

const BASE_PACKAGE_JSON = JSON.stringify(
    {
        name: "scaffold-base",
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: {
            dev: "vite",
            build: "tsc -b && vite build",
            preview: "vite preview",
        },
        dependencies: {
            react: "^19.1.0",
            "react-dom": "^19.1.0",
            "class-variance-authority": "^0.7.1",
            clsx: "^2.1.1",
            "tailwind-merge": "^3.0.2",
            "lucide-react": "^0.468.0",
            "@radix-ui/react-slot": "^1.1.1",
        },
        devDependencies: {
            "@types/react": "^19.1.0",
            "@types/react-dom": "^19.1.0",
            "@vitejs/plugin-react": "^4.5.0",
            autoprefixer: "^10.4.21",
            postcss: "^8.5.3",
            tailwindcss: "^3.4.17",
            typescript: "^5.8.3",
            vite: "^6.3.5",
        },
    },
    null,
    2
)

const BASE_VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    cors: true,
    headers: {
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
});
`

const BASE_TSCONFIG = JSON.stringify(
    {
        compilerOptions: {
            target: "ES2020",
            useDefineForClassFields: true,
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            isolatedModules: true,
            moduleDetection: "force",
            noEmit: true,
            jsx: "react-jsx",
            strict: true,
            noUnusedLocals: false,
            noUnusedParameters: false,
            noFallthroughCasesInSwitch: true,
            baseUrl: ".",
            paths: { "@/*": ["./src/*"] },
        },
        include: ["src"],
    },
    null,
    2
)

const BASE_SCAFFOLD_FILES: GeneratedFile[] = [
    { path: "package.json", content: BASE_PACKAGE_JSON },
    { path: "vite.config.ts", content: BASE_VITE_CONFIG },
    { path: "tsconfig.json", content: BASE_TSCONFIG },
    {
        path: "postcss.config.js",
        content: "export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n",
    },
    {
        path: "index.html",
        content: '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Preview</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n',
    },
]

/**
 * Pre-warm the WebContainer by booting and installing base dependencies.
 * Call this on page mount BEFORE files arrive from AI.
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
        const versionPromise = fetchSnapshotVersion()

        onEvent({ type: "boot", message: "Booting WebContainer\u2026" })
        const wc = await getInstance()
        onEvent({ type: "boot", message: "WebContainer ready" })

        _snapshotVersion = await versionPromise

        onEvent({ type: "mount", message: "Mounting scaffold\u2026" })
        const tree = filesToTree(BASE_SCAFFOLD_FILES)
        await wc.mount(tree)
        onEvent({ type: "mount", message: "Scaffold mounted" })

        onEvent({ type: "install", message: "Installing dependencies (npm install)\u2026" })

        const installProcess = await wc.spawn("npm", [
            "install", "--no-color", "--no-progress", "--prefer-offline", "--legacy-peer-deps",
        ])

        const decoder = new TextDecoder()
        const installOutputReader = installProcess.output.getReader()
        void (async () => {
            try {
                while (true) {
                    const { done, value } = await installOutputReader.read()
                    if (done) break
                    const text = typeof value === "string" ? value : decoder.decode(value)
                    const cleanText = text
                        .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
                        .trim()
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
 * Priority: 1. IndexedDB cache  2. Pre-warmed container  3. Full fresh install
 */
export async function mountAndRunWithSnapshot(
    jobId: string,
    files: GeneratedFile[],
    onEvent: ContainerEventHandler
): Promise<{ previewUrl: string | null; teardown: () => void }> {
    try {
        const version = _snapshotVersion !== "unknown" ? _snapshotVersion : await fetchSnapshotVersion()

        // Try IndexedDB cache first
        onEvent({ type: "boot", message: "Checking cache\u2026" })
        const cachedSnapshot = await loadSnapshot(jobId, version)

        if (cachedSnapshot) {
            // CACHE HIT: Instant restore
            onEvent({ type: "cache-hit", message: "Restoring from cache\u2026 (instant)" })

            const wc = await getInstance()
            await wc.mount(cachedSnapshot)
            onEvent({ type: "mount", message: "Snapshot restored" })

            // Overwrite with latest source files
            const sourceFiles = files.filter((f) => !f.path.startsWith("node_modules"))
            if (sourceFiles.length > 0) {
                const tree = filesToTree(sourceFiles)
                await wc.mount(tree)
                onEvent({ type: "mount", message: `Updated ${sourceFiles.length} source files` })
            }

            return await _startDevServer(wc, onEvent, jobId, version)
        }

        // CACHE MISS
        onEvent({ type: "cache-miss", message: "No cache found, fresh boot\u2026" })

        // Ensure pre-warm is complete
        if (!_preWarmed) {
            onEvent({ type: "install", message: "Waiting for dependencies\u2026" })
            if (_preWarmPromise) {
                await _preWarmPromise
            } else {
                await preWarmContainer(onEvent)
            }
        }

        const wc = await getInstance()

        // Mount all source files on top of pre-warmed scaffold
        onEvent({ type: "mount", message: `Mounting ${files.length} files\u2026` })
        const tree = filesToTree(files)
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
    onEvent({ type: "dev-start", message: "Starting dev server (npm run dev)\u2026" })
    const devProcess = await wc.spawn("npm", ["run", "dev"])

    const decoder = new TextDecoder()
    const devOutputReader = devProcess.output.getReader()
    void (async () => {
        try {
            while (true) {
                const { done, value } = await devOutputReader.read()
                if (done) break
                const text = typeof value === "string" ? value : decoder.decode(value)
                const cleanText = text
                    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
                    .trim()
                if (cleanText.length > 0) {
                    onEvent({ type: "terminal", message: cleanText })
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
    })

    // Save snapshot to IndexedDB in background
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
    const wc = await getInstance()

    for (const file of files) {
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
 */
export async function installPackages(
    packages: string[],
    onEvent?: ContainerEventHandler
): Promise<boolean> {
    if (packages.length === 0) return true

    try {
        const wc = await getInstance()
        onEvent?.({ type: "install", message: `Installing ${packages.join(", ")}\u2026` })

        const installProcess = await wc.spawn("npm", [
            "install", "--no-color", "--no-progress", ...packages,
        ])

        const decoder = new TextDecoder()
        const outputReader = installProcess.output.getReader()
        void (async () => {
            try {
                while (true) {
                    const { done, value } = await outputReader.read()
                    if (done) break
                    const text = typeof value === "string" ? value : decoder.decode(value)
                    const cleanText = text
                        .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
                        .trim()
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
