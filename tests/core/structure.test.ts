import { describe, expect, it } from 'vitest'
import { analyzeEnergyProfile, energyProximity, findTransitionCandidates } from '@/core/structure'
import type { BeatGrid } from '@/core/types'

/**
 * `bands` is interleaved [low, mid, high] RMS per bucket (`analyzeWaveform`,
 * `platform/analyzer-js/analyze.ts`). These fixtures put the whole energy
 * value into the low band and leave mid/high at zero — the function only
 * ever looks at the sum of all three, so this is equivalent to a real track
 * for testing purposes without needing real audio.
 *
 * `secondsOfLevel` builds one bucket per 0.1s (10 buckets/sec — finer than
 * the function's own 1s analysis window, matching how real `bands` arrays
 * are always denser than the window they get downsampled into).
 */
function secondsOfLevel(...levels: { sec: number; level: number }[]): {
  bands: Float32Array
  durationSec: number
} {
  const bucketsPerSec = 10
  const totalSec = levels.reduce((a, l) => a + l.sec, 0)
  const bucketCount = Math.round(totalSec * bucketsPerSec)
  const bands = new Float32Array(bucketCount * 3)
  let bucket = 0
  for (const { sec, level } of levels) {
    const n = Math.round(sec * bucketsPerSec)
    for (let i = 0; i < n && bucket < bucketCount; i++, bucket++) {
      bands[bucket * 3] = level
    }
  }
  return { bands, durationSec: totalSec }
}

describe('findTransitionCandidates', () => {
  it('finds a rise out of a quiet intro and a fall into a quiet outro', () => {
    const { bands, durationSec } = secondsOfLevel(
      { sec: 5, level: 0.1 }, // quiet intro
      { sec: 20, level: 1.0 }, // loud body
      { sec: 5, level: 0.1 }, // quiet outro
    )
    const candidates = findTransitionCandidates(bands, durationSec, null)
    const builds = candidates.find((c) => c.reason === 'energy-builds')
    const drops = candidates.find((c) => c.reason === 'energy-drops')
    expect(builds?.sec).toBe(5)
    expect(drops?.sec).toBe(25)
  })

  it('a track that is loud from the first second has no "builds" candidate', () => {
    // Nothing precedes second 0 to have risen from — a candidate there would
    // overstate what the heuristic found, which is exactly what this
    // function must never do (ROADMAP.md v0.4.6's honesty requirement).
    const { bands, durationSec } = secondsOfLevel({ sec: 30, level: 1.0 })
    const candidates = findTransitionCandidates(bands, durationSec, null)
    expect(candidates.find((c) => c.reason === 'energy-builds')).toBeUndefined()
  })

  it('a uniformly flat track (loud or quiet) returns no candidates at all', () => {
    const loud = secondsOfLevel({ sec: 30, level: 1.0 })
    const quiet = secondsOfLevel({ sec: 30, level: 0.1 })
    expect(findTransitionCandidates(loud.bands, loud.durationSec, null)).toEqual([])
    expect(findTransitionCandidates(quiet.bands, quiet.durationSec, null)).toEqual([])
  })

  it('finds a quiet passage in the middle, separate from the intro/outro candidates', () => {
    const { bands, durationSec } = secondsOfLevel(
      { sec: 5, level: 0.1 }, // intro
      { sec: 10, level: 1.0 }, // body
      { sec: 6, level: 0.1 }, // breakdown
      { sec: 10, level: 1.0 }, // body again
      { sec: 5, level: 0.1 }, // outro
    )
    const candidates = findTransitionCandidates(bands, durationSec, null)
    expect(candidates.some((c) => c.reason === 'quiet-passage')).toBe(true)
  })

  it('quantizes candidates to the beat grid when one is given', () => {
    const { bands, durationSec } = secondsOfLevel(
      { sec: 5, level: 0.1 },
      { sec: 20, level: 1.0 },
      { sec: 5, level: 0.1 },
    )
    const grid: BeatGrid = { bpm: 120, offsetSec: 0.1 } // beat every 0.5s, offset by 0.1s
    const candidates = findTransitionCandidates(bands, durationSec, grid)
    const builds = candidates.find((c) => c.reason === 'energy-builds')
    // Unquantized this would be exactly 5; on this grid the nearest beat is 5.1.
    expect(builds?.sec).toBeCloseTo(5.1, 5)
  })

  it('an empty bands array returns no candidates rather than throwing', () => {
    expect(findTransitionCandidates(new Float32Array(0), 0, null)).toEqual([])
  })
})

/** `analyzeEnergyProfile` over the same fixture builder the candidate tests above use. */
function profileOfLevel(...levels: { sec: number; level: number }[]) {
  const { bands, durationSec } = secondsOfLevel(...levels)
  return analyzeEnergyProfile(bands, durationSec)
}

describe('energyProximity', () => {
  it('reads "close" when both tracks sit at the same near-peak-relative level', () => {
    const outgoing = profileOfLevel({ sec: 20, level: 1.0 })
    const incoming = profileOfLevel({ sec: 20, level: 1.0 })
    expect(energyProximity(outgoing, 10, incoming, 10)).toBe('close')
  })

  it('reads "louder" when the incoming candidate point is well above the outgoing deck\'s current level', () => {
    // outgoing deck is currently in its own quiet half; incoming candidate
    // sits in its own loud half — both relative to each track's own peak.
    const outgoing = profileOfLevel({ sec: 10, level: 1.0 }, { sec: 10, level: 0.1 })
    const incoming = profileOfLevel({ sec: 10, level: 0.1 }, { sec: 10, level: 1.0 })
    expect(energyProximity(outgoing, 15, incoming, 15)).toBe('louder')
  })

  it('reads "quieter" when the incoming candidate point is well below the outgoing deck\'s current level', () => {
    const outgoing = profileOfLevel({ sec: 10, level: 1.0 }, { sec: 10, level: 1.0 })
    const incoming = profileOfLevel({ sec: 10, level: 1.0 }, { sec: 10, level: 0.1 })
    expect(energyProximity(outgoing, 2, incoming, 15)).toBe('quieter')
  })

  it('returns null — never a guessed "close" — when the outgoing deck has no profile yet', () => {
    const incoming = profileOfLevel({ sec: 20, level: 1.0 })
    expect(energyProximity(null, 5, incoming, 5)).toBeNull()
  })

  it('returns null when the outgoing deck\'s own analysis is empty (too short/no data)', () => {
    const outgoing = analyzeEnergyProfile(new Float32Array(0), 0)
    const incoming = profileOfLevel({ sec: 20, level: 1.0 })
    expect(energyProximity(outgoing, 0, incoming, 5)).toBeNull()
  })

  it('returns null when the outgoing deck is silent (near-peak level is ~0)', () => {
    const outgoing = profileOfLevel({ sec: 20, level: 0 })
    const incoming = profileOfLevel({ sec: 20, level: 1.0 })
    expect(energyProximity(outgoing, 5, incoming, 5)).toBeNull()
  })

  it('returns null when the incoming candidate track has no usable contour', () => {
    const outgoing = profileOfLevel({ sec: 20, level: 1.0 })
    const incoming = analyzeEnergyProfile(new Float32Array(0), 0)
    expect(energyProximity(outgoing, 5, incoming, 5)).toBeNull()
  })
})
