import { describe, expect, it } from 'vitest'
import {
  MAX_RATE,
  POSITION_EPSILON_SEC,
  SEC_PER_REV,
  pxPerRev,
  scratchRateFromDrag,
  shouldPushPosition,
} from '@/core/scratch.ts'

/** Repeated application, the way a stream of pointer events actually arrives. */
const drag = (dxPerEvent: number, dtSec: number, size: number, events: number): number => {
  let rate = 0
  for (let i = 0; i < events; i++) rate = scratchRateFromDrag(dxPerEvent, dtSec, size, rate)
  return rate
}

describe('scratchRateFromDrag', () => {
  it('is the same rate wherever the platter was grabbed', () => {
    // The bug this replaces: with atan2 the gain depended on the grab radius.
    // Horizontal travel has no radius, so the only way to say it is that the
    // function cannot see one — the same dx is the same rate, always.
    const a = scratchRateFromDrag(10, 1 / 60, 142, 0)
    const b = scratchRateFromDrag(10, 1 / 60, 142, 0)
    expect(a).toBe(b)
  })

  it('one rim-circumference per SEC_PER_REV settles at rate 1', () => {
    // Sweep at the speed the marker turns on its own and the rate is 1 — the
    // property the platter's feel is built on. Smoothing is exponential, so it
    // approaches rather than snaps; 60 events is one second of pointer moves.
    const size = 142
    const dt = 1 / 60
    const dxPerEvent = pxPerRev(size) / (SEC_PER_REV / dt)
    expect(drag(dxPerEvent, dt, size, 60)).toBeCloseTo(1, 3)
  })

  it('scales with platter size, so travel-per-revolution follows the rim', () => {
    const dt = 1 / 60
    const small = drag(pxPerRev(60) / (SEC_PER_REV / dt), dt, 60, 60)
    const large = drag(pxPerRev(142) / (SEC_PER_REV / dt), dt, 142, 60)
    expect(small).toBeCloseTo(large, 6)
  })

  it('runs backwards for a leftward drag', () => {
    expect(scratchRateFromDrag(-40, 1 / 60, 142, 0)).toBeLessThan(0)
  })

  it('clamps a flick to MAX_RATE in both directions', () => {
    expect(drag(4000, 1 / 240, 142, 40)).toBe(MAX_RATE)
    expect(drag(-4000, 1 / 240, 142, 40)).toBe(-MAX_RATE)
  })

  it('holds the previous rate instead of dividing by zero', () => {
    // Two pointer events inside one millisecond is ordinary, not exceptional.
    expect(scratchRateFromDrag(10, 0, 142, 0.7)).toBe(0.7)
    expect(scratchRateFromDrag(10, -0.001, 142, 0.7)).toBe(0.7)
    expect(scratchRateFromDrag(10, 1 / 60, 0, 0.7)).toBe(0.7)
  })

  it('decays toward zero when the finger stops moving', () => {
    let rate = 2
    for (let i = 0; i < 20; i++) rate = scratchRateFromDrag(0, 1 / 60, 142, rate)
    expect(Math.abs(rate)).toBeLessThan(0.01)
  })
})

describe('shouldPushPosition', () => {
  it('ignores sub-epsilon drift while playing normally', () => {
    expect(shouldPushPosition(10 + POSITION_EPSILON_SEC / 2, 10, false)).toBe(false)
  })

  it('pushes an ordinary frame of playback', () => {
    expect(shouldPushPosition(10.016, 10, false)).toBe(true)
  })

  it('pushes a slow scratch that the epsilon used to swallow', () => {
    // Rate 0.05 at 60fps moves 0.0008s per frame — under the epsilon. This is
    // the frozen platter: the audio moved and the marker did not.
    const perFrame = 0.05 / 60
    expect(perFrame).toBeLessThan(POSITION_EPSILON_SEC)
    expect(shouldPushPosition(10 + perFrame, 10, false)).toBe(false)
    expect(shouldPushPosition(10 + perFrame, 10, true)).toBe(true)
  })

  it('still says no when nothing moved at all, hand on the platter or not', () => {
    expect(shouldPushPosition(10, 10, true)).toBe(false)
    expect(shouldPushPosition(10, 10, false)).toBe(false)
  })

  it('pushes a backwards scratch', () => {
    expect(shouldPushPosition(10 - 0.0008, 10, true)).toBe(true)
  })
})
