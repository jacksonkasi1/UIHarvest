// ** import core packages
import type { Response } from "express"

// ** import types
import type { GeneratedFile } from "@uiharvest/types"

// ** import apis
import { generateObject } from "ai"
import { zodSchema } from "@ai-sdk/provider-utils"
import { z } from "zod"
import { getChatModel } from "../ai/provider.js"
import { getStarterFiles } from "./starter-files.js"

// ════════════════════════════════════════════════════
// SSE HELPERS
// ════════════════════════════════════════════════════

function sendSSE(res: Response, data: object): void {
  try {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
      if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
        ;(res as unknown as { flush: () => void }).flush()
      }
    }
  } catch {
    // ignore
  }
}

// ════════════════════════════════════════════════════
// SCAFFOLD GENERATOR
// ════════════════════════════════════════════════════

const scaffoldSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    }),
  ),
})

const ENFORCED_INFRA_PATHS = new Set([
  "index.html",
  "package.json",
  "vite.config.ts",
  "postcss.config.js",
  "tailwind.config.ts",
  "postcss.config.js",
  "tailwind.config.ts",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "src/main.tsx",
  "src/index.css",
  "src/lib/utils.ts",
])

export function normalizeScaffoldFiles(projectName: string, files: GeneratedFile[]): GeneratedFile[] {
  const starterFiles = getStarterFiles(projectName)
  const starterByPath = new Map(starterFiles.map((file) => [file.path, file]))
  const filteredFiles = files.filter((file) => !ENFORCED_INFRA_PATHS.has(file.path))
  const normalizedFiles = [...filteredFiles]

  for (const infraPath of ENFORCED_INFRA_PATHS) {
    const starterFile = starterByPath.get(infraPath)
    if (starterFile) {
      normalizedFiles.push(starterFile)
    }
  }

  return normalizedFiles
}

/**
 * Generates initial project files using Gemini based on a user prompt.
 * Falls back to the starter template if generation fails.
 *
 * SSE progress events are streamed to res throughout the generation.
 */
export async function generateProjectScaffold(
  projectName: string,
  initialPrompt: string,
  res: Response,
): Promise<GeneratedFile[]> {
  sendSSE(res, { phase: "generating", message: "Generating initial code…", progress: 10 })

  // If no meaningful prompt is given, just return the starter template
  const trimmedPrompt = initialPrompt.trim()
  const hasPrompt = trimmedPrompt.length > 3 && trimmedPrompt.toLowerCase() !== "hello world"

  if (!hasPrompt) {
    const starterFiles = getStarterFiles(projectName)
    sendSSE(res, { phase: "ready", message: "Project ready", progress: 100 })
    return starterFiles
  }

  try {
    sendSSE(res, { phase: "generating", message: "AI is writing your app…", progress: 30 })

    const result = await generateObject({
      model: getChatModel(),
      schema: zodSchema(scaffoldSchema),
      prompt: `You are an expert React developer. Generate a complete, working React + Vite + TypeScript + Tailwind CSS v4 web application based on this description:

"${trimmedPrompt}"

Project name: "${projectName}"

CRITICAL RULES:
1. Generate ALL required files for a complete, runnable Vite + React + TypeScript project
2. Use Tailwind CSS v3 with a postcss.config.js and tailwind.config.ts (NOT v4, as v4 native binaries fail in our browser environment)
3. Use React 19 with functional components and hooks only
4. Every component must be properly typed TypeScript
5. The app must be beautiful, polished, and production-ready
6. Use lucide-react for icons (it's already in package.json)
7. Use the cn() utility from src/lib/utils.ts for conditional classes

REQUIRED FILES (always include these exact files):
- index.html (with <div id="root"> and script type="module" src="/src/main.tsx")
- package.json (with react, react-dom, lucide-react, clsx, tailwind-merge, @types/react, @types/react-dom, @vitejs/plugin-react, tailwindcss@^3.4.17, postcss, autoprefixer, vite@^5.4.11, typescript, and overrides: { "rollup": "npm:@rollup/wasm-node" })
- vite.config.ts (using @vitejs/plugin-react, path alias @/ → ./src, and optimizeDeps with noDiscovery: true and includes for react, lucide-react, clsx, etc)
- postcss.config.js
- tailwind.config.ts (configured for src/**/*.{ts,tsx})
- tsconfig.json (references tsconfig.app.json and tsconfig.node.json)
- tsconfig.app.json (with paths: { "@/*": ["./src/*"] }, jsx: "react-jsx")
- tsconfig.node.json
- src/main.tsx (imports App from ./App, renders into #root)
- src/index.css (with @tailwind base/components/utilities)
- src/App.tsx (main app component)
- src/lib/utils.ts (exports cn() function using clsx + tailwind-merge)
- Any additional component files needed

The src/index.css MUST follow this exact pattern:
\`\`\`css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    /* ... other CSS variables */
  }
}
\`\`\`

Return only valid, complete file contents. No placeholder comments like "// rest of implementation".`,
    })

    sendSSE(res, { phase: "generating", message: "Finalising files…", progress: 80 })

    const generatedFiles: GeneratedFile[] = result.object.files
    const mergedFiles = normalizeScaffoldFiles(projectName, generatedFiles)

    sendSSE(res, { phase: "ready", message: "Project ready", progress: 100 })
    return mergedFiles
  } catch (err) {
    console.warn("[scaffold] AI generation failed, using starter template:", (err as Error).message)
    sendSSE(res, { phase: "generating", message: "Using starter template…", progress: 70 })

    const starterFiles = getStarterFiles(projectName)
    // Apply the user prompt as the App.tsx content hint
    const appFile = starterFiles.find((f) => f.path === "src/App.tsx")
    if (appFile) {
      appFile.content = `export function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center space-y-4 p-8 max-w-lg">
        <h1 className="text-4xl font-bold text-slate-900">
          ${projectName}
        </h1>
        <p className="text-slate-500 text-lg leading-relaxed">
          ${trimmedPrompt}
        </p>
        <p className="text-slate-400 text-sm">
          Ask the AI to build this out for you.
        </p>
      </div>
    </div>
  )
}
`
    }

    sendSSE(res, { phase: "ready", message: "Project ready", progress: 100 })
    return starterFiles
  }
}
