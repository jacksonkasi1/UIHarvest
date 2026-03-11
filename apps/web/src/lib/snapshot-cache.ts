/**
 * snapshot-cache.ts
 *
 * IndexedDB-based cache for WebContainer binary snapshots.
 *
 * Two tiers:
 *   1. "base-snapshot" store  — caches the pre-built base-snapshot.bin
 *      downloaded from the server (node_modules already included).
 *      Invalidated by version hash from /snapshot-version.json.
 *
 *   2. "snapshots" store      — caches per-job full-state snapshots taken
 *      after the dev server starts for instant restore on repeat visits.
 */

// ════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════

const DB_NAME = "wc-snapshot-cache";
const DB_VERSION = 2;
const STORE_NAME = "snapshots";
const BASE_STORE_NAME = "base-snapshot";
const MAX_CACHED_JOBS = 5;

// ════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════

interface CachedSnapshot {
    jobId: string;
    version: string;
    data: ArrayBuffer;
    createdAt: number;
    lastAccessedAt: number;
}

// ════════════════════════════════════════════════════
// INDEXEDDB HELPERS
// ════════════════════════════════════════════════════

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "jobId" });
                store.createIndex("version", "version", { unique: false });
                store.createIndex("lastAccessedAt", "lastAccessedAt", { unique: false });
            }
            // v2: base snapshot store (keyed by version string)
            if (!db.objectStoreNames.contains(BASE_STORE_NAME)) {
                db.createObjectStore(BASE_STORE_NAME, { keyPath: "version" });
            }
            void event; // suppress unused variable lint
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════

/**
 * Save a snapshot to IndexedDB with a version tag.
 */
export async function saveSnapshot(
    jobId: string,
    data: Uint8Array | ArrayBuffer,
    version: string
): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        const entry: CachedSnapshot = {
            jobId,
            version,
            data: data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer : data,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
        };

        store.put(entry);

        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        db.close();
        console.log(`[snapshot-cache] Saved snapshot for job ${jobId} (v: ${version})`);

        // Prune old entries in background
        pruneSnapshots().catch(() => { /* no-op */ });
    } catch (err) {
        console.warn("[snapshot-cache] Failed to save snapshot:", (err as Error).message);
    }
}

/**
 * Load a cached snapshot for a job.
 * Returns null if not found or if the version doesn't match (stale cache).
 */
export async function loadSnapshot(
    jobId: string,
    currentVersion: string
): Promise<Uint8Array | null> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        return new Promise<Uint8Array | null>((resolve) => {
            const request = store.get(jobId);

            request.onsuccess = () => {
                const entry = request.result as CachedSnapshot | undefined;

                if (!entry) {
                    db.close();
                    resolve(null);
                    return;
                }

                // Version mismatch → stale cache
                if (entry.version !== currentVersion) {
                    console.log(
                        `[snapshot-cache] Version mismatch for ${jobId}: cached=${entry.version} current=${currentVersion}. Purging.`
                    );
                    store.delete(jobId);
                    db.close();
                    resolve(null);
                    return;
                }

                // Update last accessed timestamp
                entry.lastAccessedAt = Date.now();
                store.put(entry);

                db.close();
                console.log(`[snapshot-cache] Cache HIT for job ${jobId}`);
                resolve(new Uint8Array(entry.data));
            };

            request.onerror = () => {
                db.close();
                resolve(null);
            };
        });
    } catch (err) {
        console.warn("[snapshot-cache] Failed to load snapshot:", (err as Error).message);
        return null;
    }
}

/**
 * Delete a specific snapshot by jobId.
 */
export async function deleteSnapshot(jobId: string): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        store.delete(jobId);

        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        console.log(`[snapshot-cache] Deleted snapshot for job ${jobId}`);
    } catch (err) {
        console.warn(`[snapshot-cache] Failed to delete snapshot for ${jobId}:`, (err as Error).message);
    }
}

/**
 * Purge all snapshots that don't match the current version.
 */
export async function purgeStaleSnapshots(currentVersion: string): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        const request = store.openCursor();
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                const entry = cursor.value as CachedSnapshot;
                if (entry.version !== currentVersion) {
                    console.log(`[snapshot-cache] Purging stale snapshot: ${entry.jobId} (v: ${entry.version})`);
                    cursor.delete();
                }
                cursor.continue();
            }
        };

        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (err) {
        console.warn("[snapshot-cache] Failed to purge stale snapshots:", (err as Error).message);
    }
}

/**
 * LRU eviction: keep only the most recently accessed MAX_CACHED_JOBS snapshots.
 */
async function pruneSnapshots(): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        // Get all entries sorted by lastAccessedAt
        const request = store.index("lastAccessedAt").openCursor();
        const entries: CachedSnapshot[] = [];

        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                entries.push(cursor.value as CachedSnapshot);
                cursor.continue();
            } else {
                // Remove oldest entries if we exceed the limit
                if (entries.length > MAX_CACHED_JOBS) {
                    const toRemove = entries.slice(0, entries.length - MAX_CACHED_JOBS);
                    for (const entry of toRemove) {
                        store.delete(entry.jobId);
                        console.log(`[snapshot-cache] LRU evicted: ${entry.jobId}`);
                    }
                }
            }
        };

        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch (err) {
        console.warn("[snapshot-cache] Failed to prune snapshots:", (err as Error).message);
    }
}

/**
 * Fetch the current snapshot version from the server.
 */
export async function fetchSnapshotVersion(): Promise<string> {
    try {
        const res = await fetch("/snapshot-version.json");
        if (!res.ok) return "unknown";
        const data = await res.json();
        return data.version || "unknown";
    } catch {
        return "unknown";
    }
}

// ════════════════════════════════════════════════════
// BASE SNAPSHOT CACHE (pre-built server-side snapshot)
// ════════════════════════════════════════════════════

interface CachedBaseSnapshot {
    version: string;
    data: ArrayBuffer;
    cachedAt: number;
}

/**
 * Load the pre-built base snapshot from IndexedDB.
 * Returns null if not cached or version doesn't match.
 */
export async function loadBaseSnapshot(version: string): Promise<Uint8Array | null> {
    try {
        const db = await openDB();
        return new Promise<Uint8Array | null>((resolve) => {
            const tx = db.transaction(BASE_STORE_NAME, "readonly");
            const store = tx.objectStore(BASE_STORE_NAME);
            const request = store.get(version);

            request.onsuccess = () => {
                const entry = request.result as CachedBaseSnapshot | undefined;
                db.close();
                if (!entry) {
                    resolve(null);
                    return;
                }
                console.log(`[snapshot-cache] Base snapshot cache HIT (v: ${version})`);
                resolve(new Uint8Array(entry.data));
            };

            request.onerror = () => {
                db.close();
                resolve(null);
            };
        });
    } catch (err) {
        console.warn("[snapshot-cache] Failed to load base snapshot:", (err as Error).message);
        return null;
    }
}

/**
 * Save the pre-built base snapshot to IndexedDB.
 * Automatically evicts all other versions to keep storage clean.
 */
/**
 * Clear ALL IndexedDB caches (both base-snapshot and per-job snapshots).
 * Used by the manual hard-reset button to force a full re-download.
 */
export async function clearAllCaches(): Promise<void> {
    try {
        const db = await openDB()

        // Clear per-job snapshots
        const tx1 = db.transaction(STORE_NAME, "readwrite")
        tx1.objectStore(STORE_NAME).clear()
        await new Promise<void>((resolve, reject) => {
            tx1.oncomplete = () => resolve()
            tx1.onerror = () => reject(tx1.error)
        })

        // Clear base snapshot
        const tx2 = db.transaction(BASE_STORE_NAME, "readwrite")
        tx2.objectStore(BASE_STORE_NAME).clear()
        await new Promise<void>((resolve, reject) => {
            tx2.oncomplete = () => resolve()
            tx2.onerror = () => reject(tx2.error)
        })

        db.close()
        console.log("[snapshot-cache] All caches cleared")
    } catch (err) {
        console.warn("[snapshot-cache] Failed to clear all caches:", (err as Error).message)
    }
}

export async function saveBaseSnapshot(version: string, data: ArrayBuffer): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(BASE_STORE_NAME, "readwrite");
        const store = tx.objectStore(BASE_STORE_NAME);

        // Clear all previous versions first
        store.clear();

        const entry: CachedBaseSnapshot = {
            version,
            data,
            cachedAt: Date.now(),
        };
        store.put(entry);

        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        console.log(`[snapshot-cache] Base snapshot saved (v: ${version}, ${(data.byteLength / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err) {
        console.warn("[snapshot-cache] Failed to save base snapshot:", (err as Error).message);
    }
}
