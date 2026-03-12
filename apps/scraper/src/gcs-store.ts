// ** import core packages
import fs from "node:fs";
import path from "node:path";

// ** import utils
import { Storage } from "@google-cloud/storage";

// ════════════════════════════════════════════════════
// GCS STORE
//
// Handles upload / download / delete of extraction job
// output directories in Google Cloud Storage.
//
// Bucket layout per job:
//   jobs/<jobId>/extraction.json
//   jobs/<jobId>/design-memory/<file>.md
//   jobs/<jobId>/assets/<file>
//   jobs/<jobId>/screenshots/<file>
//   … (all files under the local outputDir)
// ════════════════════════════════════════════════════

const GCS_BUCKET = process.env.GCS_BUCKET || "uiharvest-jobs";

let _storage: Storage | null = null;

function getStorage(): Storage {
  if (!_storage) {
    _storage = new Storage();
  }
  return _storage;
}

function getBucket() {
  return getStorage().bucket(GCS_BUCKET);
}

/**
 * Ensure the bucket exists — creates it if not (idempotent).
 * Only runs once per process.
 */
let _bucketEnsured = false;
export async function ensureBucket(): Promise<void> {
  if (_bucketEnsured) return;
  const bucket = getBucket();
  const [exists] = await bucket.exists();
  if (!exists) {
    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      "";
    await getStorage().createBucket(GCS_BUCKET, {
      location: process.env.GCP_REGION || "asia-south1",
      storageClass: "STANDARD",
      projectId: projectId || undefined,
    });
    console.log(`[gcs] Created bucket: ${GCS_BUCKET}`);
  }
  _bucketEnsured = true;
}

/**
 * Upload all files in a local directory to GCS under jobs/<jobId>/.
 */
export async function uploadJobDir(
  jobId: string,
  localDir: string
): Promise<void> {
  await ensureBucket();
  const bucket = getBucket();

  const allFiles = walkDir(localDir);
  await Promise.all(
    allFiles.map(async (absPath) => {
      const relPath = path.relative(localDir, absPath).replace(/\\/g, "/");
      const gcsPath = `jobs/${jobId}/${relPath}`;
      await bucket.upload(absPath, { destination: gcsPath });
    })
  );
  console.log(`[gcs] Uploaded ${allFiles.length} files for job ${jobId}`);
}

/**
 * Download a single file from GCS into a local path.
 * Returns the local path, or null if the object doesn't exist.
 */
export async function downloadFile(
  jobId: string,
  relPath: string,
  localPath: string
): Promise<string | null> {
  await ensureBucket();
  const bucket = getBucket();
  const gcsPath = `jobs/${jobId}/${relPath}`;
  const file = bucket.file(gcsPath);

  const [exists] = await file.exists();
  if (!exists) return null;

  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  await file.download({ destination: localPath });
  return localPath;
}

/**
 * Download the entire job directory from GCS to a local path.
 * Returns the local dir, or null if no files exist for this job.
 */
export async function downloadJobDir(
  jobId: string,
  localDir: string
): Promise<string | null> {
  await ensureBucket();
  const bucket = getBucket();
  const prefix = `jobs/${jobId}/`;

  const [files] = await bucket.getFiles({ prefix });
  if (files.length === 0) return null;

  await Promise.all(
    files.map(async (file: any) => {
      const relPath = file.name.slice(prefix.length);
      if (!relPath) return; // skip the directory marker itself
      const localPath = path.join(localDir, relPath);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      await file.download({ destination: localPath });
    })
  );
  console.log(`[gcs] Downloaded ${files.length} files for job ${jobId} → ${localDir}`);
  return localDir;
}

/**
 * Read a single file from GCS as a string (UTF-8).
 * Returns null if the object doesn't exist.
 */
export async function readFileFromGCS(
  jobId: string,
  relPath: string
): Promise<string | null> {
  await ensureBucket();
  const bucket = getBucket();
  const gcsPath = `jobs/${jobId}/${relPath}`;
  const file = bucket.file(gcsPath);

  const [exists] = await file.exists();
  if (!exists) return null;

  const [contents] = await file.download();
  return contents.toString("utf-8");
}

/**
 * Stream a GCS file into an HTTP response (for asset serving).
 * Returns false if the object doesn't exist.
 */
export async function streamFileToResponse(
  jobId: string,
  relPath: string,
  res: import("express").Response
): Promise<boolean> {
  await ensureBucket();
  const bucket = getBucket();
  const gcsPath = `jobs/${jobId}/${relPath}`;
  const file = bucket.file(gcsPath);

  const [exists] = await file.exists();
  if (!exists) return false;

  const [metadata] = await file.getMetadata();
  const contentType = (metadata as any).contentType || "application/octet-stream";
  res.setHeader("Content-Type", contentType);

  await new Promise<void>((resolve, reject) => {
    file
      .createReadStream()
      .on("error", reject)
      .pipe(res)
      .on("finish", resolve)
      .on("error", reject);
  });
  return true;
}

/**
 * Delete all GCS objects for a job.
 */
export async function deleteJobFromGCS(jobId: string): Promise<void> {
  await ensureBucket();
  const bucket = getBucket();
  const prefix = `jobs/${jobId}/`;

  const [files] = await bucket.getFiles({ prefix });
  await Promise.all(files.map((f: any) => f.delete()));
  console.log(`[gcs] Deleted ${files.length} files for job ${jobId}`);
}

/**
 * Check if a job's result file exists in GCS.
 * Supports both design-system.json (current) and extraction.json (legacy).
 */
export async function jobExistsInGCS(jobId: string): Promise<boolean> {
  await ensureBucket();
  const bucket = getBucket();
  const [ds] = await bucket.file(`jobs/${jobId}/design-system.json`).exists();
  if (ds) return true;
  const [legacy] = await bucket.file(`jobs/${jobId}/extraction.json`).exists();
  return legacy;
}

/**
 * Upload a local file to GCS and return the GCS path.
 */
export async function uploadFile(
  jobId: string,
  relPath: string,
  localPath: string
): Promise<void> {
  await ensureBucket();
  const bucket = getBucket();
  const gcsPath = `jobs/${jobId}/${relPath}`;
  await bucket.upload(localPath, { destination: gcsPath });
}

/**
 * Generate a signed download URL for a GCS object (default 15 min).
 * Returns null if the object doesn't exist.
 */
export async function getSignedDownloadUrl(
  jobId: string,
  relPath: string,
  expiresInMs = 15 * 60 * 1000
): Promise<string | null> {
  await ensureBucket();
  const bucket = getBucket();
  const gcsPath = `jobs/${jobId}/${relPath}`;
  const file = bucket.file(gcsPath);

  const [exists] = await file.exists();
  if (!exists) return null;

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInMs,
  });
  return url;
}

// ── Helpers ──────────────────────────────────────────────────────────

function walkDir(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}
