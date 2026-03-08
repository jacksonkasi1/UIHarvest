#!/usr/bin/env node
/**
 * generate-base-snapshot.ts
 *
 * Build-time script that generates a pre-built WebContainer binary snapshot
 * with all base scaffold dependencies pre-installed.
 *
 * Run: bun run scripts/generate-base-snapshot.ts
 *
 * This creates:
 *   - web/public/base-snapshot.bin   (binary snapshot ~15-30MB)
 *   - web/public/snapshot-version.json  (version hash for cache invalidation)
 */

// ** import core packages
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { createHash } from "crypto";

// ** import lib
import { snapshot } from "@webcontainer/snapshot";

// ════════════════════════════════════════════════════
// BASE SCAFFOLD DEFINITION
// ════════════════════════════════════════════════════
// Keep this in sync with src/remix/codegen/scaffold.ts generatePackageJson()

const BASE_PACKAGE_JSON = {
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
};

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
`;

const TSCONFIG = JSON.stringify(
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
);

const POSTCSS_CONFIG = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

const TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
`;

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const MAIN_TSX = `import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif",color:"#888"}}>Loading...</div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

const INDEX_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

// ════════════════════════════════════════════════════
// GENERATE VERSION HASH
// ════════════════════════════════════════════════════

function computeVersionHash(): string {
    const depsString = JSON.stringify({
        dependencies: BASE_PACKAGE_JSON.dependencies,
        devDependencies: BASE_PACKAGE_JSON.devDependencies,
    });
    const hash = createHash("sha256").update(depsString).digest("hex").slice(0, 12);
    return `v_${hash}`;
}

// ════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════

async function main() {
    const startTime = Date.now();

    console.log("🔧 Generating base WebContainer snapshot...\n");

    // 1. Create temp directory
    const tempDir = mkdtempSync(join(tmpdir(), "wc-snapshot-"));
    console.log(`📁 Temp directory: ${tempDir}`);

    try {
        // 2. Write scaffold files
        writeFileSync(join(tempDir, "package.json"), JSON.stringify(BASE_PACKAGE_JSON, null, 2));
        writeFileSync(join(tempDir, "vite.config.ts"), VITE_CONFIG);
        writeFileSync(join(tempDir, "tsconfig.json"), TSCONFIG);
        writeFileSync(join(tempDir, "postcss.config.js"), POSTCSS_CONFIG);
        writeFileSync(join(tempDir, "tailwind.config.ts"), TAILWIND_CONFIG);
        writeFileSync(join(tempDir, "index.html"), INDEX_HTML);

        // Create src directory
        execSync(`mkdir -p ${join(tempDir, "src")}`, { stdio: "inherit" });
        writeFileSync(join(tempDir, "src", "main.tsx"), MAIN_TSX);
        writeFileSync(join(tempDir, "src", "index.css"), INDEX_CSS);

        console.log("✅ Scaffold files written\n");

        // 3. Install dependencies
        console.log("📦 Installing dependencies (npm install)...");
        execSync("npm install --no-color --no-progress --prefer-offline", {
            cwd: tempDir,
            stdio: "inherit",
        });
        console.log("✅ Dependencies installed\n");

        // 4. Generate binary snapshot
        console.log("📸 Generating binary snapshot...");
        const snapshotBuffer = await snapshot(tempDir);
        const snapshotSize = (snapshotBuffer.byteLength / (1024 * 1024)).toFixed(2);
        console.log(`✅ Snapshot generated: ${snapshotSize} MB\n`);

        // 5. Compute version hash
        const versionHash = computeVersionHash();
        console.log(`🏷️  Version hash: ${versionHash}\n`);

        // 6. Save to web/public/
        const outputDir = join(import.meta.dirname, "..", "web", "public");
        execSync(`mkdir -p ${outputDir}`, { stdio: "inherit" });

        const snapshotPath = join(outputDir, "base-snapshot.bin");
        writeFileSync(snapshotPath, Buffer.from(snapshotBuffer));
        console.log(`💾 Saved: ${snapshotPath}`);

        const versionPath = join(outputDir, "snapshot-version.json");
        writeFileSync(
            versionPath,
            JSON.stringify(
                {
                    version: versionHash,
                    generatedAt: new Date().toISOString(),
                    sizeBytes: snapshotBuffer.byteLength,
                    dependencies: BASE_PACKAGE_JSON.dependencies,
                    devDependencies: BASE_PACKAGE_JSON.devDependencies,
                },
                null,
                2
            )
        );
        console.log(`💾 Saved: ${versionPath}`);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n🎉 Done in ${elapsed}s! Snapshot is ready for deployment.`);
    } finally {
        // Cleanup temp dir
        rmSync(tempDir, { recursive: true, force: true });
    }
}

main().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
});
