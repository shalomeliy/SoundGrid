/**
 * Content-hash identity (v0.4.0). One full read of the file — the same cost
 * `loadTrackToDeck` already pays via `readTrackData` before decoding — digested
 * with SHA-256 via Web Crypto. A weak/sampled hash was rejected: a collision
 * here would silently serve one track's cached analysis, cue points or genre
 * override for a *different* track, which is exactly the "silent wrong data"
 * class of bug `CLAUDE.md`'s "never skip silently" rule exists to prevent.
 *
 * This is the on-demand, single-file path (e.g. a genre edit on a track the
 * background queue hasn't reached yet). The batch background queue
 * (`platform/analyzer-worker/`) computes the same hash as a side effect of its
 * own per-track processing, not by calling this a second time.
 */
import { bytesToHex } from '@/core/hash'

/** Digests bytes already in memory — the deck-load and background-analysis paths both read the whole file anyway, so hashing costs nothing extra there. */
export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return bytesToHex(digest)
}

export async function hashFile(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  const bytes = await file.arrayBuffer()
  return hashBytes(bytes)
}
