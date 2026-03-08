// ** import core packages
import crypto from "node:crypto";

// ** import utils
import path from "path";
import fs from "fs";
import os from "os";

// ** import apis
import { runExtraction } from "../extract-pipeline.js";
import { runAnalyzeStage } from "../memory/analyze/index.js";
import { runInterpretStage } from "../memory/interpret/index.js";
import { GeminiClient } from "../gemini-client.js";
import { extractBrand } from "./brand-extractor.js";
import { extractPrinciples } from "./principles-extractor.js";
import { generateRemixSpec } from "./spec-generator.js";
import { RemixCodeGenerator } from "./codegen/generator.js";
import { buildSystemPrompt } from "./codegen/system-prompt.js";

// ** import types (chat)
import type { ChatHandlerDeps } from "./chat-handler.js";

// ** import types
import type {
    RemixJob,
    RemixProgressEvent,
    RemixPhase,
    RemixResult,
    GeneratedFile,
    BrandIdentity,
    RemixSpec,
    DesignPrinciples
} from "./types.js";
import type { DesignIR } from "../memory/ir/types.js";

// ════════════════════════════════════════════════════
// REMIX MANAGER
// ════════════════════════════════════════════════════

const TTL_MS = 60 * 60 * 1000; // 1 hour

export class RemixManager {
    private jobs = new Map<string, RemixJob>();
    private generators = new Map<string, RemixCodeGenerator>();
    private cleanupInterval: ReturnType<typeof setInterval>;

    constructor() {
        this.cleanupInterval = setInterval(() => this.cleanup(), 120_000);
    }

    /**
     * Create and start a new remix job.
     */
    create(opts: {
        referenceUrl?: string;
        targetUrl?: string;
        brandOverrides?: Partial<BrandIdentity>;
        initialPrompt?: string;
    }): RemixJob {
        const id = crypto.randomUUID().slice(0, 12);

        const job: RemixJob = {
            id,
            referenceUrl: opts.referenceUrl,
            targetUrl: opts.targetUrl,
            brandOverrides: opts.brandOverrides,
            initialPrompt: opts.initialPrompt,
            status: "running",
            phase: "init",
            events: [],
            result: null,
            files: [],
            createdAt: Date.now(),
            listeners: new Set(),
        };

        this.jobs.set(id, job);
        this.runJob(job);
        return job;
    }

    /**
     * Get a remix job by ID.
     */
    get(id: string): RemixJob | undefined {
        return this.jobs.get(id);
    }

    /**
     * Subscribe to real-time remix progress events.
     */
    subscribe(
        id: string,
        listener: (event: RemixProgressEvent) => void
    ): (() => void) | null {
        const job = this.jobs.get(id);
        if (!job) return null;

        job.listeners.add(listener);

        // Send buffered events
        for (const event of job.events) {
            listener(event);
        }

        return () => {
            job.listeners.delete(listener);
        };
    }

    /**
     * Iterate on a completed remix with a user prompt.
     */
    async iterate(
        id: string,
        userPrompt: string,
        images?: Array<{ data: string; mimeType: string }>
    ): Promise<GeneratedFile[] | null> {
        const job = this.jobs.get(id);
        const generator = this.generators.get(id);
        if (!job || !generator || job.status !== "done") return null;

        this.emit(job, {
            phase: "iterating",
            message: "Processing your request...",
        });

        try {
            const files = await generator.iterate(userPrompt, (msg) => {
                this.emit(job, { phase: "iterating", message: msg });
            }, images);

            job.files = files;
            this.emit(job, {
                phase: "ready",
                message: `Iteration complete — ${files.length} files`,
            });

            return files;
        } catch (err) {
            this.emit(job, {
                phase: "error",
                message: (err as Error).message,
                error: (err as Error).message,
            });
            return null;
        }
    }

    /**
     * Get chat handler dependencies for a job.
     * Returns null if job doesn't exist or isn't ready.
     */
    getChatDeps(id: string): ChatHandlerDeps | null {
        const job = this.jobs.get(id);
        const generator = this.generators.get(id);
        if (!job || !generator || job.status !== "done") return null;

        const spec = job.result?.spec;
        if (!spec) return null;

        return {
            jobId: id,
            spec,
            files: job.files,
            codegenSystemPrompt: buildSystemPrompt(spec),
            onFilesUpdated: (newFiles) => {
                job.files = newFiles;
            },
        };
    }

    // ════════════════════════════════════════════════════
    // PRIVATE
    // ════════════════════════════════════════════════════

    private emit(job: RemixJob, event: RemixProgressEvent): void {
        job.events.push(event);
        job.phase = event.phase;
        for (const listener of job.listeners) {
            try { listener(event); } catch { }
        }
    }

    /**
     * Run the full remix pipeline.
     */
    private async runJob(job: RemixJob): Promise<void> {
        try {
            let spec: RemixSpec;
            const ai = new GeminiClient();

            if (job.referenceUrl) {
                // ── Step 1: Extract reference site ─────────────────────────────────
                this.emit(job, {
                    phase: "extracting-reference",
                    message: `Extracting design from ${job.referenceUrl}…`,
                    progress: 0.1,
                });

                const refOutputDir = path.join(os.tmpdir(), `uiharvest-remix-ref-${job.id}`);
                const refResult = await runExtraction({
                    url: job.referenceUrl,
                    outputDir: refOutputDir,
                    force: true,
                    resume: false,
                    runMemory: false,
                    skipVision: true,
                });

                if (!refResult.success || !refResult.data) {
                    throw new Error(`Failed to extract reference site: ${refResult.error}`);
                }

                // ── Step 2: Build IR from reference ─────────────────────────────────
                this.emit(job, {
                    phase: "extracting-reference",
                    message: "Analyzing reference design system…",
                    progress: 0.25,
                });

                const refPartialIR = runAnalyzeStage(refResult.data);
                const refIR: DesignIR = await runInterpretStage(refPartialIR, ai);
                const principles = extractPrinciples(refIR);

                // ── Step 3: Extract target brand (or use overrides) ─────────────────
                let brand: BrandIdentity;

                if (job.targetUrl) {
                    this.emit(job, {
                        phase: "extracting-target",
                        message: `Extracting brand from ${job.targetUrl}…`,
                        progress: 0.4,
                    });

                    const targetOutputDir = path.join(os.tmpdir(), `uiharvest-remix-target-${job.id}`);
                    const targetResult = await runExtraction({
                        url: job.targetUrl,
                        outputDir: targetOutputDir,
                        force: true,
                        resume: false,
                        runMemory: false,
                        skipVision: true,
                    });

                    if (!targetResult.success || !targetResult.data) {
                        throw new Error(`Failed to extract target site: ${targetResult.error}`);
                    }

                    const targetPartialIR = runAnalyzeStage(targetResult.data);
                    const targetIR: DesignIR = await runInterpretStage(targetPartialIR, ai);
                    brand = extractBrand(targetIR, targetResult.data);

                    try { fs.rmSync(targetOutputDir, { recursive: true, force: true }); } catch { }
                } else {
                    brand = {
                        name: job.brandOverrides?.name ?? "My Site",
                        colors: job.brandOverrides?.colors ?? [
                            { hex: "#3B82F6", role: "primary" },
                            { hex: "#10B981", role: "accent" },
                        ],
                        typography: job.brandOverrides?.typography ?? [
                            { family: "Inter", role: "heading", weights: [600, 700], source: "google" },
                            { family: "Inter", role: "body", weights: [400, 500], source: "google" },
                        ],
                        assets: job.brandOverrides?.assets ?? [],
                    };
                }

                if (job.brandOverrides) {
                    if (job.brandOverrides.name) brand.name = job.brandOverrides.name;
                    if (job.brandOverrides.colors?.length) brand.colors = job.brandOverrides.colors;
                    if (job.brandOverrides.typography?.length) brand.typography = job.brandOverrides.typography;
                    if (job.brandOverrides.assets?.length) brand.assets = job.brandOverrides.assets;
                }

                // ── Step 4: Generate remix spec ─────────────────────────────────────
                this.emit(job, {
                    phase: "building-spec",
                    message: "Building remix specification…",
                    progress: 0.5,
                });
                spec = generateRemixSpec(brand, principles);

                const generator = new RemixCodeGenerator(spec);
                this.generators.set(job.id, generator);

                // ── Step 5: Generate scaffold ────────────────────────────────────────
                this.emit(job, {
                    phase: "generating-scaffold",
                    message: "Generating project scaffold…",
                    progress: 0.55,
                });

                job.files = await generator.generate((msg, progress) => {
                    this.emit(job, {
                        phase: "generating-pages",
                        message: msg,
                        progress: 0.55 + progress * 0.45,
                    });
                });

                // Clean up reference output
                try { fs.rmSync(refOutputDir, { recursive: true, force: true }); } catch { }

            } else {
                // ── FROM SCRATCH (NO REFERENCE URL) ─────────────────────────────────
                this.emit(job, {
                    phase: "building-spec",
                    message: "Setting up new workspace…",
                    progress: 0.1,
                });

                const brand: BrandIdentity = {
                    name: "AI Studio app",
                    colors: [
                        { hex: "#000000", role: "background" },
                        { hex: "#FFFFFF", role: "text" },
                        { hex: "#3B82F6", role: "primary" },
                    ],
                    typography: [
                        { family: "Inter", role: "heading", weights: [600, 700], source: "google" },
                        { family: "Inter", role: "body", weights: [400, 500], source: "google" }
                    ],
                    assets: []
                };

                const principles: DesignPrinciples = {
                    layoutPatterns: [], componentPatterns: [],
                    spacingSystem: { baseUnit: 4, scale: [4, 8, 16], unit: "px" },
                    motionStyle: { easing: "ease", duration: "200ms", patterns: [] },
                    principles: [], constraints: [], hierarchy: []
                };

                spec = {
                    brand,
                    principles,
                    pages: [{ path: "src/App.tsx", title: "App", description: job.initialPrompt || "App layout", sections: [] }],
                    targetStack: { framework: "react", bundler: "vite", language: "typescript", styling: "tailwindcss", ui: "shadcn" },
                    generationHints: []
                };

                const generator = new RemixCodeGenerator(spec);
                this.generators.set(job.id, generator);

                this.emit(job, {
                    phase: "generating-scaffold",
                    message: "Generating project scaffold…",
                    progress: 0.3,
                });

                // Get scaffold + dummy App.tsx
                job.files = await generator.generate((msg) => {
                    this.emit(job, { phase: "generating-scaffold", message: msg, progress: 0.4 });
                });

                // Immediately pass initial prompt into iteration
                if (job.initialPrompt) {
                    this.emit(job, {
                        phase: "generating-pages",
                        message: "Applying initial prompt…",
                        progress: 0.6,
                    });

                    job.files = await generator.iterate(job.initialPrompt, (msg) => {
                        this.emit(job, { phase: "generating-pages", message: msg, progress: 0.8 });
                    });
                }
            }

            // ── Done ─────────────────────────────────────────────────────────────
            job.result = {
                success: true,
                files: job.files, // Use job.files which is updated in branches
                spec,
            };
            job.status = "done";

            this.emit(job, {
                phase: "ready",
                message: `Remix complete — ${job.files.length} files generated`,
                progress: 1.0,
            });
        } catch (err) {
            job.status = "error";
            this.emit(job, {
                phase: "error",
                message: (err as Error).message || "Unknown error",
                error: (err as Error).message,
            });
        }
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [id, job] of this.jobs) {
            if (now - job.createdAt > TTL_MS && (job.status === "done" || job.status === "error")) {
                this.jobs.delete(id);
                this.generators.delete(id);
            }
        }
    }

    destroy(): void {
        clearInterval(this.cleanupInterval);
    }
}
