// ** import core packages
import crypto from "node:crypto";

// ** import utils
import path from "path";
import fs from "fs";
import os from "os";

// ** import apis
import { runExtraction } from "./extract-pipeline.js";

// ** import types
import type { ProgressEvent, ExtractionResult } from "./extract-pipeline.js";

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

export type JobStatus = "queued" | "running" | "done" | "error";

export interface Job {
    id: string;
    url: string;
    status: JobStatus;
    outputDir: string;
    events: ProgressEvent[];
    result: ExtractionResult | null;
    createdAt: number;
    listeners: Set<(event: ProgressEvent) => void>;
    pages?: string[];
}

// ════════════════════════════════════════════════════
// JOB MANAGER
// ════════════════════════════════════════════════════

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export class JobManager {
    private jobs = new Map<string, Job>();
    private cleanupInterval: ReturnType<typeof setInterval>;

    constructor() {
        // Periodically clean up expired jobs
        this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    }

    /**
     * Create and immediately start a new extraction job.
     */
    create(url: string, runMemory: boolean = false, pages?: string[]): Job {
        const id = crypto.randomUUID().slice(0, 12);
        const outputDir = path.join(os.tmpdir(), `uiharvest-job-${id}`);

        const job: Job = {
            id,
            url,
            status: "running",
            outputDir,
            events: [],
            result: null,
            createdAt: Date.now(),
            listeners: new Set(),
            pages,
        };

        this.jobs.set(id, job);

        // Start extraction in the background (fire-and-forget)
        this.runJob(job, runMemory);

        return job;
    }

    /**
     * Get a job by ID.
     */
    get(id: string): Job | undefined {
        return this.jobs.get(id);
    }

    /**
     * Subscribe to real-time progress events for a job.
     * Returns an unsubscribe function.
     */
    subscribe(
        id: string,
        listener: (event: ProgressEvent) => void
    ): (() => void) | null {
        const job = this.jobs.get(id);
        if (!job) return null;

        job.listeners.add(listener);

        // Send all buffered events so the client catches up
        for (const event of job.events) {
            listener(event);
        }

        return () => {
            job.listeners.delete(listener);
        };
    }

    /**
     * Run the extraction pipeline in the background.
     */
    private async runJob(job: Job, runMemory: boolean): Promise<void> {
        try {
            const result = await runExtraction({
                url: job.url,
                outputDir: job.outputDir,
                force: true,
                resume: false,
                runMemory,
                skipVision: true, // Skip AgentDriver in web mode
                pages: job.pages,
                onProgress: (event) => {
                    job.events.push(event);
                    // Notify all live listeners
                    for (const listener of job.listeners) {
                        try {
                            listener(event);
                        } catch { }
                    }
                },
            });

            job.result = result;
            job.status = result.success ? "done" : "error";
        } catch (err) {
            const errorEvent: ProgressEvent = {
                phase: "error",
                message: (err as Error).message || "Unknown error",
                error: (err as Error).message,
            };
            job.events.push(errorEvent);
            for (const listener of job.listeners) {
                try {
                    listener(errorEvent);
                } catch { }
            }
            job.status = "error";
        }
    }

    /**
     * Remove expired jobs and clean up their output directories.
     */
    private cleanup(): void {
        const now = Date.now();
        for (const [id, job] of this.jobs) {
            if (
                now - job.createdAt > TTL_MS &&
                (job.status === "done" || job.status === "error")
            ) {
                // Clean up temp directory
                try {
                    if (fs.existsSync(job.outputDir)) {
                        fs.rmSync(job.outputDir, { recursive: true, force: true });
                    }
                } catch { }
                this.jobs.delete(id);
            }
        }
    }

    destroy(): void {
        clearInterval(this.cleanupInterval);
    }
}
