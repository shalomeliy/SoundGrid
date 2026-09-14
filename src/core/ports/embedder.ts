/**
 * v0.8.5. A separate port from `Analyzer` on purpose — see
 * `workshop-output/PLAN.md` §3: an embedding is a large vector with a
 * model-tied lifecycle (a model swap invalidates every cached value), not a
 * small deterministic field like `TrackAnalysis`'s bpm/waveform. `core/`
 * only ever sees `Float32Array` in and out — never a model/tensor type from
 * whatever runs behind an implementation.
 */
import type { PcmData } from '@/core/ports/analyzer'

export interface Embedder {
  /** Identifies which model produced a vector — part of the cache key, never compared across implementations. */
  readonly modelId: string
  embed(pcm: PcmData): Promise<Float32Array>
}

/** Embeddings are large and model-versioned, so this is a cache separate from `AnalysisCache` — see `core/embedding-cache.ts` for the freshness policy. */
export interface EmbeddingCache {
  get(contentHash: string, modelId: string): Promise<Float32Array | null>
  put(contentHash: string, modelId: string, vector: Float32Array): Promise<void>
}
