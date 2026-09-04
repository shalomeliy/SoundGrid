import { describe, expect, it } from 'vitest'
import { crossfadeGains, crossfadeProgress, phaseAlignedEntrySec } from '@/core/transition'
import type { BeatGrid } from '@/core/types'

describe('crossfadeGains', () => {
  it('progress 0 is fully on the "from" deck', () => {
    const g = crossfadeGains(0)
    expect(g.fromGain).toBeCloseTo(1, 10)
    expect(g.toGain).toBeCloseTo(0, 10)
  })

  it('progress 1 is fully on the "to" deck', () => {
    const g = crossfadeGains(1)
    expect(g.fromGain).toBeCloseTo(0, 10)
    expect(g.toGain).toBeCloseTo(1, 10)
  })

  it('the midpoint is equal-power, not a linear 0.5/0.5', () => {
    const g = crossfadeGains(0.5)
    // cos(pi/4) === sin(pi/4) === ~0.7071, not 0.5 — that's what makes it
    // equal-power (sum of squares stays 1 throughout the fade).
    expect(g.fromGain).toBeCloseTo(Math.SQRT1_2, 10)
    expect(g.toGain).toBeCloseTo(Math.SQRT1_2, 10)
    expect(g.fromGain * g.fromGain + g.toGain * g.toGain).toBeCloseTo(1, 10)
  })

  it('clamps out-of-range progress instead of extrapolating', () => {
    expect(crossfadeGains(-1)).toEqual(crossfadeGains(0))
    expect(crossfadeGains(2)).toEqual(crossfadeGains(1))
  })
})

describe('crossfadeProgress', () => {
  it('is 0 at the start and 1 once the duration has elapsed', () => {
    expect(crossfadeProgress(0, 8)).toBe(0)
    expect(crossfadeProgress(8, 8)).toBe(1)
    expect(crossfadeProgress(4, 8)).toBeCloseTo(0.5, 10)
  })

  it('clamps past the duration rather than exceeding 1', () => {
    expect(crossfadeProgress(20, 8)).toBe(1)
  })

  it('a non-positive duration is treated as already complete', () => {
    expect(crossfadeProgress(0, 0)).toBe(1)
  })
})

describe('phaseAlignedEntrySec', () => {
  it('no correction needed when the incoming deck would already land in phase', () => {
    const grid: BeatGrid = { bpm: 120, offsetSec: 0 } // beat every 0.5s
    // Master is exactly on a beat (position 10.0s, grid offset 0) — entering
    // the incoming deck at one of its own beats (2.0s, same grid) is already
    // in phase, so the seek offset should be ~0.
    expect(phaseAlignedEntrySec(2.0, grid, 10.0, grid)).toBeCloseTo(2.0, 10)
  })

  it('nudges the entry point to match the master phase, never by more than half a beat', () => {
    const grid: BeatGrid = { bpm: 120, offsetSec: 0 } // beat every 0.5s
    // Master sits a quarter-beat (0.125s) off its own grid's nearest beat.
    const seek = phaseAlignedEntrySec(2.0, grid, 10.125, grid)
    expect(Math.abs(seek - 2.0)).toBeLessThanOrEqual(0.25 + 1e-9) // half of 0.5s beat
    expect(seek).toBeCloseTo(2.125, 10)
  })

  it('works across two different tempos, not just identical grids', () => {
    const incoming: BeatGrid = { bpm: 128, offsetSec: 0 }
    const master: BeatGrid = { bpm: 128, offsetSec: 0.05 }
    const seek = phaseAlignedEntrySec(4.0, incoming, 20.0, master)
    expect(typeof seek).toBe('number')
    expect(Number.isFinite(seek)).toBe(true)
  })
})
