import { describe, expect, it } from 'vitest'
import { moveHotCue, pickHotCueSlot } from '@/core/hotcues'
import type { HotCue } from '@/core/types'

function cue(index: number, overrides: Partial<HotCue> = {}): HotCue {
  return { index, positionSec: index * 10, label: `${index + 1}`, color: '#000', ...overrides }
}

describe('moveHotCue', () => {
  it('is a no-op when the source pad has no cue', () => {
    const cues = [cue(1)]
    expect(moveHotCue(cues, 0, 2)).toBe(cues)
  })

  it('is a no-op when source and target are the same pad', () => {
    const cues = [cue(0)]
    expect(moveHotCue(cues, 0, 0)).toBe(cues)
  })

  it('relocates onto an empty pad', () => {
    const cues = [cue(0), cue(2)]
    const next = moveHotCue(cues, 0, 1)
    expect(next.map((c) => c.index)).toEqual([1, 2])
    const moved = next.find((c) => c.positionSec === 0)
    expect(moved?.index).toBe(1)
    expect(moved?.label).toBe('2')
  })

  it('swaps with an occupied pad, keeping both cues', () => {
    const cues = [cue(0), cue(1)]
    const next = moveHotCue(cues, 0, 1)
    expect(next).toHaveLength(2)
    const wasZero = next.find((c) => c.positionSec === 0)
    const wasOne = next.find((c) => c.positionSec === 10)
    expect(wasZero?.index).toBe(1)
    expect(wasZero?.label).toBe('2')
    expect(wasOne?.index).toBe(0)
    expect(wasOne?.label).toBe('1')
  })

  it('keeps the result sorted by index', () => {
    const cues = [cue(2), cue(0)]
    const next = moveHotCue(cues, 0, 3)
    expect(next.map((c) => c.index)).toEqual([2, 3])
  })

  it('a descriptive (v0.4.7) label survives relocating onto an empty pad', () => {
    const cues = [cue(0, { label: 'Mix in' })]
    const next = moveHotCue(cues, 0, 3)
    expect(next[0]).toMatchObject({ index: 3, label: 'Mix in' })
  })

  it('a descriptive label survives swapping with an occupied pad, and the plain one it swaps with still renumbers', () => {
    const cues = [cue(0, { label: 'Mix in' }), cue(1)]
    const next = moveHotCue(cues, 0, 1)
    const moved = next.find((c) => c.label === 'Mix in')
    const plain = next.find((c) => c.label !== 'Mix in')
    expect(moved?.index).toBe(1)
    expect(plain?.index).toBe(0)
    expect(plain?.label).toBe('1')
  })
})

describe('pickHotCueSlot', () => {
  it('picks the first empty pad, in order', () => {
    expect(pickHotCueSlot([cue(0), cue(2)])).toBe(1)
  })

  it('picks index 0 when no pads are occupied', () => {
    expect(pickHotCueSlot([])).toBe(0)
  })

  it('evicts the oldest-created pad when all 8 are occupied', () => {
    const cues = Array.from({ length: 8 }, (_, i) => cue(i, { createdAt: 1000 - i }))
    // index 7 has the smallest createdAt (1000 - 7), so it is the oldest.
    expect(pickHotCueSlot(cues)).toBe(7)
  })

  it('treats a cue with no createdAt as the oldest of all', () => {
    const cues = [cue(0, { createdAt: 500 }), cue(1), cue(2, { createdAt: 900 })]
    const full = [...cues, ...Array.from({ length: 5 }, (_, i) => cue(i + 3, { createdAt: 700 + i }))]
    expect(pickHotCueSlot(full)).toBe(1)
  })
})
