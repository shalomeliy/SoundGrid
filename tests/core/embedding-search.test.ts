import { describe, expect, it } from 'vitest'
import { cosineSimilarity, rankBySimilarity, type SimilarityCandidate } from '@/core/embedding-search'

function vec(...values: number[]): Float32Array {
  return new Float32Array(values)
}

function candidate(contentHash: string, embedding: Float32Array): SimilarityCandidate {
  return { contentHash, embedding, bpm: null, genre: null }
}

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity(vec(1, 2, 3), vec(1, 2, 3))).toBeCloseTo(1)
  })

  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity(vec(1, 0), vec(-1, 0))).toBeCloseTo(-1)
  })

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(vec(1, 0), vec(0, 1))).toBeCloseTo(0)
  })

  it('throws on mismatched lengths — different models are not comparable', () => {
    expect(() => cosineSimilarity(vec(1, 2), vec(1, 2, 3))).toThrow(/length mismatch/)
  })
})

describe('rankBySimilarity', () => {
  const seed = candidate('seed', vec(1, 0))

  it('ranks closer vectors first', () => {
    const near = candidate('near', vec(1, 0.1))
    const far = candidate('far', vec(0, 1))
    const result = rankBySimilarity(seed, [far, near])
    expect(result.map((r) => r.contentHash)).toEqual(['near', 'far'])
  })

  it('excludes the seed track itself even if passed in as a candidate', () => {
    const other = candidate('other', vec(0.9, 0.1))
    const result = rankBySimilarity(seed, [seed, other])
    expect(result.map((r) => r.contentHash)).toEqual(['other'])
  })

  it('respects the limit option', () => {
    const candidates = Array.from({ length: 5 }, (_, i) => candidate(`c${i}`, vec(1, i)))
    expect(rankBySimilarity(seed, candidates, { limit: 2 })).toHaveLength(2)
  })

  it('throws when a candidate embedding length disagrees with the seed', () => {
    const bad = candidate('bad', vec(1, 0, 0))
    expect(() => rankBySimilarity(seed, [bad])).toThrow(/length mismatch/)
  })
})
