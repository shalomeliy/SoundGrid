/**
 * The pure part of `platform/embed-cache-idb/store.ts` — mirrors
 * `core/analysis-cache.ts`'s split so the freshness policy is unit-tested
 * without a real IndexedDB. Two independent freshness checks, not one: a
 * `modelId` mismatch means a different model entirely (v0.20.0-style
 * upgrade, e.g. classical → CLAP), an `embedderVersion` mismatch means the
 * *same* model's extraction logic changed (e.g. an MFCC parameter fix) —
 * `workshop-output/PLAN.md` §3.
 */

export interface StoredEmbeddingEntry {
  contentHash: string
  modelId: string
  embedderVersion: number
  vector: Float32Array
  cachedAt: number
}

/** A mismatch on either axis is a miss, never the stale vector — re-embedding is always safe and idempotent, same reasoning as `resolveCacheEntry`. */
export function resolveEmbeddingEntry(
  stored: StoredEmbeddingEntry | undefined,
  modelId: string,
  currentVersion: number,
): Float32Array | null {
  if (!stored) return null
  if (stored.modelId !== modelId) return null
  if (stored.embedderVersion !== currentVersion) return null
  return stored.vector
}
