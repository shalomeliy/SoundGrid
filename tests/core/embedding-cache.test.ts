import { describe, expect, it } from 'vitest'
import { resolveEmbeddingEntry, type StoredEmbeddingEntry } from '@/core/embedding-cache'

function makeEntry(modelId: string, embedderVersion: number): StoredEmbeddingEntry {
  return { contentHash: 'abc', modelId, embedderVersion, vector: new Float32Array([1, 2, 3]), cachedAt: 0 }
}

describe('resolveEmbeddingEntry', () => {
  it('returns null when there is no stored entry', () => {
    expect(resolveEmbeddingEntry(undefined, 'essentia-mfcc-v1', 1)).toBeNull()
  })

  it('returns the stored vector when model and version both match', () => {
    const entry = makeEntry('essentia-mfcc-v1', 1)
    expect(resolveEmbeddingEntry(entry, 'essentia-mfcc-v1', 1)).toBe(entry.vector)
  })

  it('treats a different modelId as a miss, not the stale vector', () => {
    const entry = makeEntry('essentia-mfcc-v1', 1)
    expect(resolveEmbeddingEntry(entry, 'clap-htsat-v1', 1)).toBeNull()
  })

  it('treats an embedderVersion mismatch within the same model as a miss', () => {
    const entry = makeEntry('essentia-mfcc-v1', 1)
    expect(resolveEmbeddingEntry(entry, 'essentia-mfcc-v1', 2)).toBeNull()
  })
})
