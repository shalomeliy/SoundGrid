import { describe, expect, it } from 'vitest'
import {
  bytesPerSecond,
  estimateSecondsRemaining,
  MASTER_RECORDING_MAX_SEC,
  maxRecordingBytes,
  SAMPLER_CAPTURE_MAX_SEC,
  splitByTrackBoundaries,
} from '@/core/recording'

describe('bytesPerSecond', () => {
  it('matches a hand-computed rate for 44.1kHz stereo 16-bit', () => {
    expect(bytesPerSecond(44100, 2, 16)).toBe(44100 * 2 * 2)
  })
})

describe('maxRecordingBytes / estimateSecondsRemaining', () => {
  it('the cap constants are positive and sane', () => {
    expect(MASTER_RECORDING_MAX_SEC).toBeGreaterThan(60 * 60)
    expect(SAMPLER_CAPTURE_MAX_SEC).toBeGreaterThan(0)
    expect(SAMPLER_CAPTURE_MAX_SEC).toBeLessThan(MASTER_RECORDING_MAX_SEC)
  })

  it('reports the full duration remaining at zero bytes recorded', () => {
    const sec = estimateSecondsRemaining(0, 100, 44100, 2, 16)
    expect(sec).toBeCloseTo(100, 6)
  })

  it('counts down linearly with bytes recorded', () => {
    const bps = bytesPerSecond(44100, 2, 16)
    const sec = estimateSecondsRemaining(bps * 40, 100, 44100, 2, 16)
    expect(sec).toBeCloseTo(60, 6)
  })

  it('never goes negative once the cap is exceeded', () => {
    const max = maxRecordingBytes(10, 44100, 2, 16)
    const sec = estimateSecondsRemaining(max * 2, 10, 44100, 2, 16)
    expect(sec).toBe(0)
  })
})

describe('splitByTrackBoundaries', () => {
  const sr = 1000 // 1 frame per ms, easy to reason about

  it('returns one segment covering everything when there are no boundaries', () => {
    const segs = splitByTrackBoundaries(5000, [], sr)
    expect(segs).toEqual([{ startFrame: 0, endFrame: 5000 }])
  })

  it('splits into segments at a single boundary', () => {
    const segs = splitByTrackBoundaries(5000, [2], sr)
    expect(segs).toEqual([
      { startFrame: 0, endFrame: 2000 },
      { startFrame: 2000, endFrame: 5000 },
    ])
  })

  it('sorts out-of-order boundaries before splitting', () => {
    const segs = splitByTrackBoundaries(9000, [4, 1, 7], sr)
    expect(segs).toEqual([
      { startFrame: 0, endFrame: 1000 },
      { startFrame: 1000, endFrame: 4000 },
      { startFrame: 4000, endFrame: 7000 },
      { startFrame: 7000, endFrame: 9000 },
    ])
  })

  it('deduplicates boundaries that land on the same frame', () => {
    const segs = splitByTrackBoundaries(5000, [2, 2], sr)
    expect(segs.length).toBe(2)
  })

  it('drops a boundary at or past either edge instead of producing a zero-length segment', () => {
    const segs = splitByTrackBoundaries(5000, [0, 5, 6], sr)
    expect(segs).toEqual([{ startFrame: 0, endFrame: 5000 }])
  })
})
