// ** import types
import type { GeneratedFile } from "../types.js";

// ** import utils
import { validateAndRepair } from "./validator.js";

// ════════════════════════════════════════════════════
// FILE PARSER
// ════════════════════════════════════════════════════
// Parses Gemini's code output into GeneratedFile[].
// Handles truncated responses and auto-repairs syntax issues.

/**
 * Parse fenced code blocks with file= attribute from Gemini output.
 *
 * Expected format:
 * ```tsx file="src/components/Hero.tsx"
 * // content
 * ```
 *
 * Also handles truncated blocks (missing closing ```) and
 * strips trailing markdown/explanation that leaks into code.
 */
export function parseGeneratedFiles(output: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // ── Primary regex: complete fenced blocks ──────────────────────────
    // Match code blocks with file= attribute
    // Accepts ANY language identifier (tsx, jsx, css, json, html, md, mdx, yaml, py, sh, env, etc.)
    const regex = /```[a-zA-Z0-9_.-]*\s+file="([^"]+)"\s*\n([\s\S]*?)```/g;

    let match;
    const matchedRanges: Array<[number, number]> = [];

    while ((match = regex.exec(output)) !== null) {
        const filePath = match[1].trim();
        let content = match[2].trimEnd() + "\n";

        if (filePath && content.trim()) {
            // Run auto-repair on each file's content
            const result = validateAndRepair(content, filePath);
            files.push({ path: filePath, content: result.repaired });
            matchedRanges.push([match.index, match.index + match[0].length]);
        }
    }

    // ── Truncation recovery: unclosed fenced blocks ────────────────────
    // If Gemini truncated mid-output, the closing ``` is missing.
    // Scan for any file= openers that were NOT captured by the primary regex.
    // Scan for any file= openers that were NOT captured by the primary regex.
    const openerRegex = /```[a-zA-Z0-9_.-]*\s+file="([^"]+)"\s*\n/g;
    let openerMatch;

    while ((openerMatch = openerRegex.exec(output)) !== null) {
        const openerStart = openerMatch.index;
        const contentStart = openerStart + openerMatch[0].length;

        // Check if this opener was already matched by the primary regex
        const alreadyMatched = matchedRanges.some(
            ([start, end]) => openerStart >= start && openerStart < end
        );
        if (alreadyMatched) continue;

        // This is an unclosed block — capture everything from content start to EOF
        // (or to the next opener, whichever comes first)
        const filePath = openerMatch[1].trim();
        let contentEnd = output.length;

        // Look for the next opener to avoid grabbing multiple files' content
        const nextOpener = output.indexOf("```", contentStart + 1);
        if (nextOpener > contentStart) {
            contentEnd = nextOpener;
        }

        let content = output.slice(contentStart, contentEnd).trimEnd() + "\n";

        if (filePath && content.trim()) {
            console.warn(`[parser] Recovered truncated block for "${filePath}" (${content.length} chars)`);
            const result = validateAndRepair(content, filePath);
            files.push({ path: filePath, content: result.repaired });
        }
    }

    // ── Fallback: file comment patterns ────────────────────────────────
    if (files.length === 0) {
        const fallbackRegex = /(?:\/\/\s*(?:file|File|FILE):\s*(.+?)\n|#\s*(.+?\.[a-z]+)\s*\n)```[a-zA-Z0-9_.-]*\s*\n([\s\S]*?)```/g;

        while ((match = fallbackRegex.exec(output)) !== null) {
            const filePath = (match[1] || match[2]).trim();
            let content = match[3].trimEnd() + "\n";

            if (filePath && content.trim()) {
                const result = validateAndRepair(content, filePath);
                files.push({ path: filePath, content: result.repaired });
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
