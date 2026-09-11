import { describe, expect, it } from 'vitest'
import { visibleRange } from '@/core/virtual-list'

describe('visibleRange', () => {
  it('returns nothing to render for an empty list', () => {
    expect(visibleRange(0, 400, 36, 0)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 })
  })

  it('returns nothing for a non-positive row height', () => {
    expect(visibleRange(0, 400, 0, 100)).toEqual({ start: 0, end: 0, padTop: 0, padBottom: 0 })
  })

  it('shows the top of the list at rest, with overscan below', () => {
    // 400px viewport / 36px rows = ~12 visible, +1, +6 overscan below
    const r = visibleRange(0, 400, 36, 1000, 6)
    expect(r.start).toBe(0)
    expect(r.padTop).toBe(0)
    expect(r.end).toBeGreaterThan(12)
    expect(r.end).toBeLessThan(30)
  })

  it('clamps a negative scrollTop to the top, same as scrollTop 0', () => {
    expect(visibleRange(-500, 400, 36, 1000)).toEqual(visibleRange(0, 400, 36, 1000))
  })

  it('windows around the middle of a long list, with overscan on both sides', () => {
    const rowH = 36
    const r = visibleRange(500 * rowH, 400, rowH, 5000, 6)
    expect(r.start).toBeLessThan(500)
    expect(r.start).toBeGreaterThan(480)
    expect(r.end).toBeGreaterThan(500)
    expect(r.padTop).toBe(r.start * rowH)
    expect(r.padBottom).toBe((5000 - r.end) * rowH)
  })

  it('clamps to the end of the list when scrolled past the last row', () => {
    const r = visibleRange(999_999, 400, 36, 100)
    expect(r.end).toBe(100)
    expect(r.start).toBeLessThanOrEqual(100)
    expect(r.padBottom).toBe(0)
  })

  it('never lets end fall below start', () => {
    const r = visibleRange(999_999, 400, 36, 5)
    expect(r.end).toBeGreaterThanOrEqual(r.start)
  })
})
