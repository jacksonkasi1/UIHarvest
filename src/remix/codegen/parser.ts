// ** import types
import type { GeneratedFile } from "../types.js";

// ════════════════════════════════════════════════════
// FILE PARSER
// ════════════════════════════════════════════════════
// Parses Gemini's code output into GeneratedFile[].

/**
 * Parse fenced code blocks with file= attribute from Gemini output.
 *
 * Expected format:
 * ```tsx file="src/components/Hero.tsx"
 * // content
 * ```
 */
export function parseGeneratedFiles(output: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Match code blocks with file= attribute
    // Supports: ```tsx file="path" or ```ts file="path" or ```css file="path"
    const regex = /```(?:tsx?|jsx?|css|json|html|md)\s+file="([^"]+)"\s*\n([\s\S]*?)```/g;

    let match;
    while ((match = regex.exec(output)) !== null) {
        const filePath = match[1].trim();
        const content = match[2].trimEnd() + "\n";

        if (filePath && content.trim()) {
            files.push({ path: filePath, content });
        }
    }

    // Fallback: if no file= attribute found, try to parse by common patterns
    if (files.length === 0) {
        const fallbackRegex = /(?:\/\/\s*(?:file|File|FILE):\s*(.+?)\n|#\s*(.+?\.[a-z]+)\s*\n)```(?:tsx?|jsx?|css|json|html)\s*\n([\s\S]*?)```/g;

        while ((match = fallbackRegex.exec(output)) !== null) {
            const filePath = (match[1] || match[2]).trim();
            const content = match[3].trimEnd() + "\n";

            if (filePath && content.trim()) {
                files.push({ path: filePath, content });
            }
        }
    }

    return files;
}

/**
 * Merge new files into existing files array.
 * New files overwrite existing files with the same path.
 */
export function mergeFiles(
    existing: GeneratedFile[],
    updates: GeneratedFile[]
): GeneratedFile[] {
    const fileMap = new Map<string, GeneratedFile>();

    for (const file of existing) {
        fileMap.set(file.path, file);
    }

    for (const file of updates) {
        fileMap.set(file.path, file);
    }

    return Array.from(fileMap.values());
}
