// ** import core packages
import { Firestore } from "@google-cloud/firestore"

export interface StoredFile {
  path: string
  content: string
}

export interface PersistedJobMeta {
  id: string
  status: string
  phase: string
  createdAt: number
  updatedAt: number
  referenceUrl?: string
  targetUrl?: string
  initialPrompt?: string
  projectName?: string
}

export interface PersistedJob extends PersistedJobMeta {
  result: unknown | null
}

const COLLECTION = "uiharvest_jobs"
const FILE_COLLECTION = "uiharvest_job_files"

class JobStore {
  private db: Firestore | null = null
  private enabled = false

  constructor() {
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.FIRESTORE_PROJECT_ID

    if (!projectId) return

    try {
      this.db = new Firestore({ projectId, ignoreUndefinedProperties: true })
      this.enabled = true
    } catch {
      this.db = null
      this.enabled = false
    }
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  async save(job: PersistedJob, files: StoredFile[] = []): Promise<void> {
    if (!this.db) return
    await this.db.collection(COLLECTION).doc(job.id).set(
      {
        ...job,
        updatedAt: Date.now(),
      },
      { merge: true }
    )

    if (files.length > 0) {
      await this.db.collection(FILE_COLLECTION).doc(job.id).set({
        jobId: job.id,
        updatedAt: Date.now(),
        files,
      })
    }
  }

  async load(id: string): Promise<{ job: PersistedJob; files: StoredFile[] } | null> {
    if (!this.db) return null
    const [jobDoc, filesDoc] = await Promise.all([
      this.db.collection(COLLECTION).doc(id).get(),
      this.db.collection(FILE_COLLECTION).doc(id).get(),
    ])

    if (!jobDoc.exists) return null

    return {
      job: jobDoc.data() as PersistedJob,
      files: (filesDoc.exists ? (filesDoc.data() as { files?: StoredFile[] }).files : []) || [],
    }
  }

  async listJobs(limit = 50): Promise<PersistedJobMeta[]> {
    if (!this.db) return []
    const snap = await this.db
      .collection(COLLECTION)
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get()

    return snap.docs.map((doc) => {
      const data = doc.data() as PersistedJobMeta
      return data
    })
  }

  async delete(id: string): Promise<void> {
    if (!this.db) return
    await Promise.all([
      this.db.collection(COLLECTION).doc(id).delete(),
      this.db.collection(FILE_COLLECTION).doc(id).delete(),
    ])
  }
}

export const jobStore = new JobStore()
