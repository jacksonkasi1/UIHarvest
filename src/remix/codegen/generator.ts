import "dotenv/config";

// ** import types
import type { RemixSpec, GeneratedFile } from "../types.js";

// ** import utils
import { GeminiClient } from "../../gemini-client.js";

// ** import apis
import { buildSystemPrompt, buildPagePrompt, buildIterationPrompt } from "./system-prompt.js";
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

    constructor(spec: RemixSpec) {
        this.spec = spec;
        this.ai = new GeminiClient();
        this.systemPrompt = buildSystemPrompt(spec);
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
                maxOutputTokens: 8192,
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

    /**
     * Iterate on the generated code with a user prompt.
     */
    async iterate(
        userPrompt: string,
        onProgress?: (message: string) => void,
        images?: Array<{ data: string; mimeType: string }>
    ): Promise<GeneratedFile[]> {
        onProgress?.("Processing your request...");

        const iteratePrompt = buildIterationPrompt(
            this.spec,
            userPrompt,
            this.files
        );

        let response: string;

        if (images && images.length > 0) {
            // Multimodal: send images + text to Gemini
            onProgress?.(`Analyzing ${images.length} image(s) and generating changes...`);
            response = await this.ai.chatWithImages(
                iteratePrompt,
                images,
                this.systemPrompt,
                {
                    model: "codegen",
                    maxOutputTokens: 8192,
                    temperature: 0.4,
                }
            );
        } else {
            // Text-only iteration
            response = await this.ai.chat(iteratePrompt, this.systemPrompt, {
                model: "codegen",
                maxOutputTokens: 8192,
                temperature: 0.4,
            });
        }

        if (response) {
            const updates = parseGeneratedFiles(response);
            this.files = mergeFiles(this.files, updates);
            onProgress?.(`Updated ${updates.length} file(s)`);
        }

        return this.files;
    }

    /**
     * Get all current files.
     */
    getFiles(): GeneratedFile[] {
        return this.files;
    }
}
