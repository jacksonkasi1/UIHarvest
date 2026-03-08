// ** import core packages
import { Firestore, FieldValue } from "@google-cloud/firestore";

// ** import types
import type { RemixJob, RemixResult } from "../remix/types.js";
import type { ConversationMessage } from "../remix/chat-handler.js";

// ════════════════════════════════════════════════════
// FIRESTORE JOB STORE
// Persists RemixJob state so jobs survive Cloud Run scale-to-zero.
// When the server cold-starts, jobs are lazy-loaded from Firestore.
// ════════════════════════════════════════════════════

const COLLECTION = "uiharvest_jobs";
const FILE_COLLECTION = "uiharvest_job_files";

// Serializable subset of RemixJob that we persist
interface PersistedJob {
    id: string;
    status: RemixJob["status"];
    phase: RemixJob["phase"];
    createdAt: number;
    updatedAt: number;
    referenceUrl?: string;
    targetUrl?: string;
    initialPrompt?: string;
    result: RemixResult | null;
    conversationHistory?: ConversationMessage[];
}

class JobStore {
    private db: Firestore | null = null;
    private enabled = false;

    constructor() {
        // Only enable if running on Cloud Run (has GCP credentials)
        // or FIRESTORE_PROJECT_ID env var is explicitly set
        const projectId = process.env.GOOGLE_CLOUD_PROJECT
            || process.env.GCLOUD_PROJECT
            || process.env.FIRESTORE_PROJECT_ID;

        if (projectId) {
            try {
                this.db = new Firestore({ projectId, ignoreUndefinedProperties: true });
                this.enabled = true;
                console.log(`[JobStore] Firestore enabled (project: ${projectId})`);
            } catch (err) {
                console.warn("[JobStore] Firestore init failed, running in-memory only:", (err as Error).message);
            }
        } else {
            console.log("[JobStore] No GCP project found — in-memory only (dev mode)");
        }
    }

    get isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Save/update a job in Firestore (write-through).
     * Files are stored in a separate document to avoid 1MB Firestore limit.
     */
    async save(job: RemixJob, conversationHistory?: ConversationMessage[]): Promise<void> {
        if (!this.db) return;

        try {
            const persisted: PersistedJob = {
                id: job.id,
                status: job.status,
                phase: job.phase,
                createdAt: job.createdAt,
                updatedAt: Date.now(),
                referenceUrl: job.referenceUrl,
                targetUrl: job.targetUrl,
                initialPrompt: job.initialPrompt,
                result: job.result,
                conversationHistory: conversationHistory?.slice(-20), // last 20 messages
            };

            await this.db.collection(COLLECTION).doc(job.id).set(persisted, { merge: true });

            // Store files separately (can be large)
            if (job.files.length > 0) {
                const fileData = {
                    jobId: job.id,
                    updatedAt: Date.now(),
                    files: job.files.map(f => ({ path: f.path, content: f.content })),
                };
                await this.db.collection(FILE_COLLECTION).doc(job.id).set(fileData);
            }
        } catch (err) {
            console.error("[JobStore] Save error:", (err as Error).message);
        }
    }

    /**
     * Load a job from Firestore. Returns null if not found.
     */
    async load(id: string): Promise<{ job: PersistedJob; files: { path: string; content: string }[] } | null> {
        if (!this.db) return null;

        try {
            const [jobDoc, filesDoc] = await Promise.all([
                this.db.collection(COLLECTION).doc(id).get(),
                this.db.collection(FILE_COLLECTION).doc(id).get(),
            ]);

            if (!jobDoc.exists) return null;

            const job = jobDoc.data() as PersistedJob;
            const filesData = filesDoc.exists ? (filesDoc.data() as any).files || [] : [];

            return { job, files: filesData };
        } catch (err) {
            console.error("[JobStore] Load error:", (err as Error).message);
            return null;
        }
    }

    /**
     * Delete a job and its files.
     */
    async delete(id: string): Promise<void> {
        if (!this.db) return;

        try {
            await Promise.all([
                this.db.collection(COLLECTION).doc(id).delete(),
                this.db.collection(FILE_COLLECTION).doc(id).delete(),
            ]);
        } catch (err) {
            console.error("[JobStore] Delete error:", (err as Error).message);
        }
    }

    /**
     * List all persisted jobs (for dashboard).
     */
    async listJobs(): Promise<Omit<PersistedJob, "result" | "conversationHistory">[]> {
        if (!this.db) return [];

        try {
            const snap = await this.db.collection(COLLECTION)
                .orderBy("updatedAt", "desc")
                .limit(50)
                .get();
            return snap.docs.map(d => {
                const data = d.data() as PersistedJob;
                return {
                    id: data.id,
                    status: data.status,
                    phase: data.phase,
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt,
                    referenceUrl: data.referenceUrl,
                    targetUrl: data.targetUrl,
                    initialPrompt: data.initialPrompt,
                };
            });
        } catch (err) {
            console.error("[JobStore] List error:", (err as Error).message);
            return [];
        }
    }
}

export const jobStore = new JobStore();
export type { PersistedJob };
