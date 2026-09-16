/**
 * Pure ranking math for v0.8.5's "more like this" — no IO, no model, no
 * cache. `rankBySimilarity` is cosine-only for now (`workshop-output/PLAN.md`
 * §3): hybrid blending against BPM/genre is deferred until there is a real
 * result set to check it against, not added speculatively.
 */
import type { Track } from '@/core/types'

/** `NaN` on a zero vector is deliberate — a zero embedding is not "unrelated" (0), it's undefined, and callers must not silently rank it as a mediocre match. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: length mismatch (${a.length} vs ${b.length}) — embeddings from different models are not comparable`)
  }
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export interface SimilarityCandidate {
  contentHash: string
  embedding: Float32Array
  bpm: number | null
  genre: string | null
}

export interface SimilarityMatch {
  contentHash: string
  score: number
}

const DEFAULT_LIMIT = 10

/** Ranks `candidates` by cosine similarity to `seed`, highest first. Throws if any candidate's embedding length disagrees with the seed's — see `cosineSimilarity`. */
export function rankBySimilarity(
  seed: SimilarityCandidate,
  candidates: SimilarityCandidate[],
  opts: { limit?: number } = {},
): SimilarityMatch[] {
  const limit = opts.limit ?? DEFAULT_LIMIT
  return candidates
    .filter((c) => c.contentHash !== seed.contentHash)
    .map((c) => ({ contentHash: c.contentHash, score: cosineSimilarity(seed.embedding, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export interface TrackSimilarityMatch {
  id: string
  score: number
}

/**
 * `rankBySimilarity` adapted to `Library.tsx`'s actual keys (M3) — rows are
 * addressed by `Track.id`, not `contentHash` (two rows can share a hash if
 * the same file exists at two paths in the library). Returns `[]` — never
 * throws, never a guess — when the seed itself isn't found or has no
 * embedding yet, matching every other "not ready" state in this project
 * (a disabled button, not a crash).
 */
export function findSimilarTracks(seedId: string, tracks: Track[], opts: { limit?: number } = {}): TrackSimilarityMatch[] {
  const seedTrack = tracks.find((t) => t.id === seedId)
  if (!seedTrack?.embedding || !seedTrack.contentHash) return []

  const idByHash = new Map<string, string>()
  const candidates: SimilarityCandidate[] = []
  for (const t of tracks) {
    if (!t.embedding || !t.contentHash) continue
    if (!idByHash.has(t.contentHash)) idByHash.set(t.contentHash, t.id)
    candidates.push({ contentHash: t.contentHash, embedding: t.embedding, bpm: t.bpm ?? null, genre: t.genre ?? null })
  }

  const seed: SimilarityCandidate = {
    contentHash: seedTrack.contentHash,
    embedding: seedTrack.embedding,
    bpm: seedTrack.bpm ?? null,
    genre: seedTrack.genre ?? null,
  }

  return rankBySimilarity(seed, candidates, opts).map((m) => ({
    id: idByHash.get(m.contentHash) ?? m.contentHash,
    score: m.score,
  }))
}
