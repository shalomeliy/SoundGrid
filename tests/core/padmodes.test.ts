import { describe, expect, it } from 'vitest'
import { beatJumpTargetSec, loopRollReturnSec, LOOP_BEATS_STEPS } from '@/core/padmodes.ts'

describe('beatJumpTargetSec', () => {
  it('jumps forward by the given number of beats', () => {
    // 120 bpm -> 0.5s/beat
    expect(beatJumpTargetSec(1, 120, 4, 1, 100)).toBeCloseTo(3, 5)
  })

  it('jumps backward by the given number of beats', () => {
    expect(beatJumpTargetSec(5, 120, 4, -1, 100)).toBeCloseTo(3, 5)
  })

  it('clamps a backward jump to the start of the track, never negative', () => {
    expect(beatJumpTargetSec(0.5, 120, 4, -1, 100)).toBe(0)
  })

  it('clamps a forward jump to the end of the track, never past duration', () => {
    expect(beatJumpTargetSec(9.5, 120, 4, 1, 10)).toBe(10)
  })

  it('scales with bpm', () => {
    // 60 bpm -> 1s/beat
    expect(beatJumpTargetSec(0, 60, 2, 1, 100)).toBeCloseTo(2, 5)
  })
})

describe('loopRollReturnSec', () => {
  it('returns exactly the entry point when no time has elapsed', () => {
    expect(loopRollReturnSec(10, 0, 100)).toBe(10)
  })

  it('advances by the elapsed amount', () => {
    expect(loopRollReturnSec(10, 3.5, 100)).toBeCloseTo(13.5, 5)
  })

  it('clamps to the end of the track', () => {
    expect(loopRollReturnSec(95, 10, 100)).toBe(100)
  })

  it('clamps to the start of the track (defensive — elapsed is never negative in practice)', () => {
    expect(loopRollReturnSec(5, -10, 100)).toBe(0)
  })
})

describe('LOOP_BEATS_STEPS', () => {
  it('has exactly 8 values, one per pad, ascending', () => {
    expect(LOOP_BEATS_STEPS).toHaveLength(8)
    for (let i = 1; i < LOOP_BEATS_STEPS.length; i++) {
      expect(LOOP_BEATS_STEPS[i]).toBeGreaterThan(LOOP_BEATS_STEPS[i - 1])
    }
  })
})
