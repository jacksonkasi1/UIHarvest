/**
 * Default starter file templates for new vibe-coding projects.
 *
 * These are mounted into the WebContainer as the initial project state.
 * Every new project gets a clean React + Vite + TypeScript + Tailwind scaffold.
 * The AI then customises it based on the user's initial prompt.
 */

export interface ScaffoldFile {
  path: string
  content: string
}

export function getStarterFiles(projectName: string): ScaffoldFile[] {
  return [
    {
      path: "index.html",
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: projectName.toLowerCase().replace(/\s+/g, "-"),
          private: true,
          version: "0.0.0",
          type: "module",
          scripts: {
            dev: "vite --host 0.0.0.0",
            build: "tsc -b && vite build",
            preview: "vite preview",
          },
          dependencies: {
            react: "^19.0.0",
            "react-dom": "^19.0.0",
            "lucide-react": "^0.477.0",
            "class-variance-authority": "^0.7.1",
            clsx: "^2.1.1",
            "tailwind-merge": "^3.0.2",
          },
          devDependencies: {
            "@types/node": "^22.13.5",
            "@types/react": "^19.0.6",
            "@types/react-dom": "^19.0.3",
            "@vitejs/plugin-react": "^4.3.4",
            "tailwindcss": "4.1.18",
            "@tailwindcss/vite": "4.1.18",
            "typescript": "~5.7.2",
            "vite": "^6.1.0",
          },
          overrides: {
            "rollup": "npm:@rollup/wasm-node",
            "esbuild": "npm:esbuild-wasm@^0.21.5",
            "lightningcss": "npm:lightningcss-wasm@^1.29.1"
          },
        },
        null,
        2,
      ),
    },
    {
      path: "vite.config.ts",
      content: `import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    noDiscovery: true,
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "lucide-react",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
    ],
  },
})
`,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          files: [],
          references: [
            { path: "./tsconfig.app.json" },
            { path: "./tsconfig.node.json" },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.app.json",
      content: JSON.stringify(
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
        2,
      ),
    },
    {
      path: "tsconfig.node.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2023"],
            module: "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            isolatedModules: true,
            moduleDetection: "force",
            noEmit: true,
            strict: true,
          },
          include: ["vite.config.ts"],
        },
        null,
        2,
      ),
    },
    {
      path: "src/main.tsx",
      content: `import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
    },
    {
      path: "src/index.css",
      content: `@import "tailwindcss";

:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --border: 214.3 31.8% 91.4%;
  --radius: 0.5rem;
}

@theme inline {
  --font-sans: system-ui, -apple-system, sans-serif;
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-border: hsl(var(--border));
}

@layer base {
  * {
    box-sizing: border-box;
    border-color: hsl(var(--border));
  }
  body {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: var(--font-sans);
    margin: 0;
  }
}
`,
    },
    {
      path: "src/App.tsx",
      content: `export function App() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4 p-8">
        <h1 className="text-4xl font-bold text-foreground">
          Hello, World!
        </h1>
        <p className="text-muted-foreground text-lg">
          Your project is ready. Start chatting to build something amazing.
        </p>
      </div>
    </div>
  )
}
`,
    },
    {
      path: "src/lib/utils.ts",
      content: `import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`,
    },
  ]
}
