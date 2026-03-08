import "dotenv/config";

// ** import types
import type { RemixSpec, GeneratedFile } from "../types.js";

// ** import utils
import { GeminiClient } from "../../gemini-client.js";

// ** import apis
// ** import apis
import { buildSystemPrompt, buildPagePrompt, buildIterationPrompt, buildPlannerPrompt } from "./system-prompt.js";
import { generateScaffold } from "./scaffold.js";
import { parseGeneratedFiles, mergeFiles } from "./parser.js";

// ════════════════════════════════════════════════════
// CODE GENERATOR
// ════════════════════════════════════════════════════
// Multi-turn Gemini-based code generation for remix projects.

export class RemixCodeGenerator {
    private ai: GeminiClient;
    private spec: RemixSpec;
    private systemPrompt: string;
    private files: GeneratedFile[] = [];

    constructor(spec: RemixSpec, initialFiles?: GeneratedFile[]) {
        this.spec = spec;
        this.ai = new GeminiClient();
        this.systemPrompt = buildSystemPrompt(spec);
        if (initialFiles) {
            this.files = initialFiles;
        }
    }

    /**
     * Generate the full project: scaffold + all pages.
     */
    async generate(
        onProgress?: (message: string, progress: number) => void
    ): Promise<GeneratedFile[]> {
        // Step 1: Generate scaffold (deterministic, no AI)
        onProgress?.("Generating project scaffold...", 0.1);
        this.files = generateScaffold(this.spec);

        // Step 2: Generate each page via Gemini
        const totalPages = this.spec.pages.length;

        for (let i = 0; i < totalPages; i++) {
            const page = this.spec.pages[i];
            const progress = 0.2 + (0.7 * (i / totalPages));
            onProgress?.(`Generating "${page.title}"...`, progress);

            const pagePrompt = buildPagePrompt(this.spec, i);
            const response = await this.ai.chat(pagePrompt, this.systemPrompt, {
                model: "codegen",
                maxOutputTokens: 65536,
                temperature: 0.5,
            });

            if (response) {
                const pageFiles = parseGeneratedFiles(response);
                this.files = mergeFiles(this.files, pageFiles);
            }
        }

        onProgress?.("Generation complete", 1.0);
        return this.files;
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunked = [];
        for (let i = 0; i < array.length; i += size) {
            chunked.push(array.slice(i, i + size));
        }
        return chunked;
    }

    /**
     * Iterate on the generated code with a user prompt via Planner + Execution loops.
     */
    async iterate(
        userPrompt: string,
        onProgress?: (message: string) => void,
        images?: Array<{ data: string; mimeType: string }>
    ): Promise<GeneratedFile[]> {
        // ─── PHASE 1: PLANNING ─────────────────────────────
        onProgress?.("Architecting the changes (Planning Phase)...");

        const plannerPrompt = buildPlannerPrompt(this.spec, userPrompt, this.files);
        let planJsonRaw: string;

        if (images && images.length > 0) {
            planJsonRaw = await this.ai.chatWithImages(
                plannerPrompt,
                images,
                this.systemPrompt,
                { model: "analysis", maxOutputTokens: 4000, temperature: 0.2 }
            );
        } else {
            planJsonRaw = await this.ai.chat(plannerPrompt, this.systemPrompt, {
                model: "analysis",
                maxOutputTokens: 4000,
                temperature: 0.2,
            });
        }

        // Parse Plan JSON
        let plannedFiles: Array<{ file: string; action: string; reason: string }> = [];
        try {
            plannedFiles = this.ai.parseJson(planJsonRaw);
        } catch (err) {
            console.error("Failed to parse architect plan, falling back to full-prompt approach:", err);
            // Fallback object for safety
            plannedFiles = [{ file: "src/App.tsx", action: "update", reason: "Fallback catch-all" }];
        }

        if (!Array.isArray(plannedFiles)) plannedFiles = [];

        const filesToEdit = plannedFiles.map(p => p.file);
        const uniqueFilesToEdit = [...new Set(filesToEdit)];

        onProgress?.(`Planned edits for ${uniqueFilesToEdit.length} files. Starting execution...`);

        // ─── PHASE 2: EXECUTION ────────────────────────────
        // chunk the files to prevent 65k token explosion
        const chunks = this.chunkArray(uniqueFilesToEdit, 20);

        let batchIndex = 1;
        for (const batch of chunks) {
            onProgress?.(`Applying edits (Batch ${batchIndex} of ${chunks.length})...`);

            // Build subset context: Only give the agent existing code for the 4 files it's currently editing, 
            // plus maybe 1 core file like App.tsx if it's missing, to save input tokens.
            const existingCodeSubset = this.files.filter((f) => batch.includes(f.path));

            // Inform the LLM that it should only generate this specific batch of files.
            const focusedUserPrompt = `${userPrompt}\n\n[SYSTEM DIRECTIVE]: You are in phase ${batchIndex} of ${chunks.length}. You MUST generate the full updated file contents ONLY for these exact files: ${batch.join(", ")}. Do not output any other files.`;

            const iteratePrompt = buildIterationPrompt(
                this.spec,
                focusedUserPrompt,
                existingCodeSubset
            );

            let response: string;

            // Re-feed images if provided, since we might be building visual components here.
            if (images && images.length > 0) {
                response = await this.ai.chatWithImages(
                    iteratePrompt,
                    images,
                    this.systemPrompt,
                    { model: "codegen", maxOutputTokens: 65536, temperature: 0.4 }
                );
            } else {
                response = await this.ai.chat(iteratePrompt, this.systemPrompt, {
                    model: "codegen",
                    maxOutputTokens: 65536,
                    temperature: 0.4,
                });
            }

            if (response) {
                const updates = parseGeneratedFiles(response);
                this.files = mergeFiles(this.files, updates);
                onProgress?.(`Merged ${updates.length} files from Batch ${batchIndex}`);
            }
            batchIndex++;
        }

        onProgress?.(`Iteration complete. Updated ${uniqueFilesToEdit.length} files successfully.`);
        return this.files;
    }

    /**
     * Get all current files.
     */
    getFiles(): GeneratedFile[] {
        return this.files;
    }
}
