import { describe, expect, it } from 'vitest'
import { moveHotCue } from '@/core/hotcues'
import type { HotCue } from '@/core/types'

function cue(index: number): HotCue {
  return { index, positionSec: index * 10, label: `${index + 1}`, color: '#000' }
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
})
