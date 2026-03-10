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
 *   - public/base-snapshot.bin        (binary snapshot ~100+ MB)
 *   - public/snapshot-version.json    (version hash for cache invalidation)
 *
 * IMPORTANT: Keep dependencies in sync with
 *   apps/server/src/scaffold/starter-files.ts  getStarterFiles()
 */

// ** import core packages
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readdirSync, lstatSync, readlinkSync, unlinkSync, openSync, readSync, closeSync, chmodSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { createHash } from "crypto";

// ** import lib
import { snapshot } from "@webcontainer/snapshot";

// ════════════════════════════════════════════════════
// BASE SCAFFOLD DEFINITION
// ════════════════════════════════════════════════════
// Keep this in sync with apps/server/src/scaffold/starter-files.ts

const BASE_PACKAGE_JSON = {
    name: "scaffold-base",
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
        dev: "vite --host 0.0.0.0",
        build: "tsc -b && vite build",
        preview: "vite preview",
    },
    dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        "class-variance-authority": "^0.7.1",
        clsx: "^2.1.1",
        "tailwind-merge": "^3.0.2",
        "lucide-react": "^0.477.0",
        "@radix-ui/react-slot": "^1.1.1",
    },
    devDependencies: {
        "@types/node": "^22.13.5",
        "@types/react": "^19.0.6",
        "@types/react-dom": "^19.0.3",
        "@vitejs/plugin-react": "^4.3.4",
        autoprefixer: "^10.4.21",
        postcss: "^8.5.3",
        tailwindcss: "^3.4.17",
        typescript: "~5.7.2",
        vite: "^5.4.11",
    },
    overrides: {
        "rollup": "npm:@rollup/wasm-node",
        "esbuild": "npm:esbuild-wasm@^0.21.5"
    }
};

const VITE_CONFIG = `import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
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
`;

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

const TSCONFIG = JSON.stringify(
    {
        files: [],
        references: [
            { path: "./tsconfig.app.json" },
            { path: "./tsconfig.node.json" },
        ],
    },
    null,
    2
);

const TSCONFIG_APP = JSON.stringify(
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

const TSCONFIG_NODE = JSON.stringify(
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
    2
);

const INDEX_HTML = `<!DOCTYPE html>
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

const MAIN_TSX = `import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"

function App() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#888" }}>
      Loading...
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`;

const INDEX_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

// ════════════════════════════════════════════════════
// SYMLINK RESOLVER
// ════════════════════════════════════════════════════

/**
 * Returns true if the file at `path` is a text script (starts with #! or is
 * UTF-8 text). Native binaries (ELF, Mach-O, PE) are detected by their magic
 * bytes and excluded — we don't want to copy large native executables.
 */
function isTextScript(filePath: string): boolean {
    const MAGIC_BYTES = 4;
    const buf = Buffer.alloc(MAGIC_BYTES);
    let fd: number;
    try {
        fd = openSync(filePath, "r");
    } catch {
        return false;
    }
    try {
        const bytesRead = readSync(fd, buf, 0, MAGIC_BYTES, 0);
        if (bytesRead < 2) return true; // empty / tiny file -> treat as text

        // Mach-O (macOS native binary): 0xCEFAEDFE / 0xCFFAEDFE / 0xFEEDFACE / 0xFEEDFACF
        if (
            (buf[0] === 0xce || buf[0] === 0xcf) && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe
        ) return false;
        if (buf[0] === 0xfe && buf[1] === 0xed && (buf[2] === 0xfa) && (buf[3] === 0xce || buf[3] === 0xcf)) return false;
        // Fat Mach-O: 0xCAFEBABE
        if (buf[0] === 0xca && buf[1] === 0xfe && buf[2] === 0xba && buf[3] === 0xbe) return false;
        // ELF (Linux): 0x7F454C46
        if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return false;
        // PE (Windows): 0x4D5A
        if (buf[0] === 0x4d && buf[1] === 0x5a) return false;

        return true;
    } finally {
        closeSync(fd);
    }
}

/**
 * @webcontainer/snapshot uses lstat and cannot handle symlinks.
 * This recursively walks a directory and replaces every symlink with either:
 *   - A real copy of the target (if it is a text/JS script)
 *   - Nothing (deleted) if the target is a native binary — WebContainer
 *     doesn't need native host binaries; it uses its own JS-based tooling.
 */
function resolveSymlinks(dir: string): void {
    let entries: string[];
    try {
        entries = readdirSync(dir) as unknown as string[];
    } catch {
        return;
    }

    for (const name of entries) {
        const fullPath = join(dir, name);
        let stat;
        try {
            stat = lstatSync(fullPath);
        } catch {
            continue;
        }

        if (stat.isSymbolicLink()) {
            let target: string;
            try {
                const raw = readlinkSync(fullPath);
                target = resolve(dirname(fullPath), raw);
            } catch {
                unlinkSync(fullPath);
                continue;
            }

            unlinkSync(fullPath);

            // Follow symlink chains to the real file
            let resolved = target;
            try {
                let targetStat = lstatSync(resolved);
                while (targetStat.isSymbolicLink()) {
                    resolved = resolve(dirname(resolved), readlinkSync(resolved));
                    targetStat = lstatSync(resolved);
                }

                if (targetStat.isDirectory()) {
                    // Symlink to a directory — skip (not needed for npm .bin usage)
                    continue;
                }

                if (targetStat.isFile()) {
                    // Only copy text/JS scripts — skip native binaries
                    if (isTextScript(resolved)) {
                        copyFileSync(resolved, fullPath);
                        chmodSync(fullPath, targetStat.mode);
                    }
                    // If native binary: just leave deleted — WebContainer won't use it
                }
            } catch {
                // Target doesn't exist or unreadable — skip
            }
        } else if (stat.isDirectory()) {
            resolveSymlinks(fullPath);
        }
    }
}

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

    console.log("Generating base WebContainer snapshot...\n");

    // 1. Create temp directory
    const tempDir = mkdtempSync(join(tmpdir(), "wc-snapshot-"));
    console.log(`Temp directory: ${tempDir}`);

    try {
        // 2. Write scaffold files
        writeFileSync(join(tempDir, "package.json"), JSON.stringify(BASE_PACKAGE_JSON, null, 2));
        writeFileSync(join(tempDir, "vite.config.ts"), VITE_CONFIG);
        writeFileSync(join(tempDir, "tsconfig.json"), TSCONFIG);
        writeFileSync(join(tempDir, "tsconfig.app.json"), TSCONFIG_APP);
        writeFileSync(join(tempDir, "tsconfig.node.json"), TSCONFIG_NODE);
        writeFileSync(join(tempDir, "index.html"), INDEX_HTML);
        writeFileSync(join(tempDir, "postcss.config.js"), POSTCSS_CONFIG);
        writeFileSync(join(tempDir, "tailwind.config.ts"), TAILWIND_CONFIG);

        // Create src directory
        mkdirSync(join(tempDir, "src"), { recursive: true });
        writeFileSync(join(tempDir, "src", "main.tsx"), MAIN_TSX);
        writeFileSync(join(tempDir, "src", "index.css"), INDEX_CSS);

        console.log("Scaffold files written\n");

        // 3. Install dependencies
        console.log("Installing dependencies (npm install)...");
        // Install natively first so we can pre-warm the cache using host esbuild
        execSync("npm install --no-color --no-progress --prefer-offline", {
            cwd: tempDir,
            stdio: "inherit",
        });
        console.log("Dependencies installed\n");

        // 3a. Verify Rollup WASM replacement
        try {
            const hasWasm = execSync("ls node_modules/rollup/dist/*.wasm 2>/dev/null", { cwd: tempDir, encoding: "utf8" });
            if (hasWasm) {
                console.log("✅ Rollup WASM replacement successful");
            }
        } catch {
            console.log("❌ Rollup WASM replacement failed (still native)");
        }

        // 3b. Pre-warm Vite's dependency optimization cache using host's esbuild
        console.log("Pre-warming Vite .vite/deps cache...");
        try {
            execSync("npx vite optimize", {
                cwd: tempDir,
                stdio: "inherit",
            });
            console.log("✅ .vite/deps cache created\n");
        } catch (err) {
            console.error("❌ Failed to pre-warm Vite cache:", (err as Error).message);
        }

        // 3c. Reinstall specifically for Linux x64 before snapshotting
        console.log("Reinstalling dependencies for WebContainer (Linux x64)...");
        execSync("npm install --ignore-scripts --no-color --no-progress --prefer-offline --os=linux --cpu=x64", {
            cwd: tempDir,
            stdio: "inherit",
        });
        console.log("Linux dependencies installed\n");

        // 3b. Resolve symlinks — @webcontainer/snapshot cannot serialize symlinks.
        //     Replace every symlink in node_modules with a real copy of its target.
        console.log("Resolving symlinks in node_modules...");
        resolveSymlinks(join(tempDir, "node_modules"));
        console.log("Symlinks resolved\n");

        // 4. Generate binary snapshot
        console.log("Generating binary snapshot...");
        const snapshotBuffer = await snapshot(tempDir);
        const snapshotSize = (snapshotBuffer.byteLength / (1024 * 1024)).toFixed(2);
        console.log(`Snapshot generated: ${snapshotSize} MB\n`);

        // 5. Compute version hash
        const versionHash = computeVersionHash();
        console.log(`Version hash: ${versionHash}\n`);

        // 6. Save to public/
        const outputDir = join(import.meta.dirname, "..", "public");
        mkdirSync(outputDir, { recursive: true });

        const snapshotPath = join(outputDir, "base-snapshot.bin");
        writeFileSync(snapshotPath, Buffer.from(snapshotBuffer));
        console.log(`Saved: ${snapshotPath}`);

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
        console.log(`Saved: ${versionPath}`);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\nDone in ${elapsed}s! Snapshot is ready for deployment.`);
    } finally {
        // Cleanup temp dir
        rmSync(tempDir, { recursive: true, force: true });
    }
}

main().catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
});
