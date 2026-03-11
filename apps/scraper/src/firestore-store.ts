// ** import utils
import { Firestore } from "@google-cloud/firestore";

// ════════════════════════════════════════════════════
// FIRESTORE STORE
//
// Stores job metadata in Firestore collection "uiharvest-jobs".
// Each document ID = jobId.
//
// Document shape:
//   {
//     id: string
//     url: string
//     status: "running" | "done" | "error"
//     createdAt: Firestore Timestamp
//     completedAt: Firestore Timestamp | null
//     pages?: string[]
//   }
// ════════════════════════════════════════════════════

const COLLECTION = "uiharvest-jobs";

export interface JobRecord {
  id: string;
  url: string;
  status: "running" | "done" | "error";
  createdAt: number; // epoch ms
  completedAt: number | null;
  pages?: string[];
}

let _firestore: Firestore | null = null;

function getFirestore(): Firestore {
  if (!_firestore) {
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.FIRESTORE_PROJECT_ID ||
      "";
    _firestore = new Firestore({ projectId: projectId || undefined });
  }
  return _firestore;
}

// ── Write ───────────────────────────────────────────────────────────

/**
 * Create a new job record in Firestore.
 */
export async function createJobRecord(
  id: string,
  url: string,
  pages?: string[]
): Promise<void> {
  const db = getFirestore();
  const doc: Omit<JobRecord, "id"> = {
    url,
    status: "running",
    createdAt: Date.now(),
    completedAt: null,
    ...(pages ? { pages } : {}),
  };
  await db.collection(COLLECTION).doc(id).set(doc);
}

/**
 * Mark a job as done or error.
 */
export async function updateJobStatus(
  id: string,
  status: "done" | "error"
): Promise<void> {
  const db = getFirestore();
  await db.collection(COLLECTION).doc(id).update({
    status,
    completedAt: Date.now(),
  });
}

/**
 * Delete a job record from Firestore.
 */
export async function deleteJobRecord(id: string): Promise<void> {
  const db = getFirestore();
  await db.collection(COLLECTION).doc(id).delete();
}

// ── Read ────────────────────────────────────────────────────────────

/**
 * Get a single job record. Returns null if not found.
 */
export async function getJobRecord(id: string): Promise<JobRecord | null> {
  const db = getFirestore();
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;

  const d = snap.data()!;
  return {
    id: snap.id,
    url: d.url,
    status: d.status,
    createdAt:
      d.createdAt instanceof Object && "toMillis" in d.createdAt
        ? d.createdAt.toMillis()
        : Number(d.createdAt),
    completedAt: d.completedAt
      ? d.completedAt instanceof Object && "toMillis" in d.completedAt
        ? d.completedAt.toMillis()
        : Number(d.completedAt)
      : null,
    pages: d.pages,
  };
}

/**
 * List all job records, ordered by createdAt descending.
 */
export async function listJobRecords(): Promise<JobRecord[]> {
  const db = getFirestore();
  const snap = await db
    .collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      url: d.url,
      status: d.status,
      createdAt:
        d.createdAt instanceof Object && "toMillis" in d.createdAt
          ? d.createdAt.toMillis()
          : Number(d.createdAt),
      completedAt: d.completedAt
        ? d.completedAt instanceof Object && "toMillis" in d.completedAt
          ? d.completedAt.toMillis()
          : Number(d.completedAt)
        : null,
      pages: d.pages,
    };
  });
}
