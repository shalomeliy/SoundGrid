import type { HotCue } from '@/core/types'

/**
 * Pure relocate/swap/no-op reducer for dragging a hot cue pad onto another
 * slot (v0.4.0 `PadGrid.tsx` drag-and-drop). Extracted from `controls.ts` so
 * the three cases are unit-testable without a store or engine.
 *
 * - `fromIndex` empty: no-op, same array reference back.
 * - `toIndex` empty: relocate — the cue takes `toIndex` and its label follows.
 * - `toIndex` occupied: swap — both cues exchange index and label.
 *
 * Always returns the result sorted by index, matching `setHotCue`'s existing
 * ordering (`controls.ts`).
 */
export function moveHotCue(cues: HotCue[], fromIndex: number, toIndex: number): HotCue[] {
  if (fromIndex === toIndex) return cues
  const from = cues.find((c) => c.index === fromIndex)
  if (!from) return cues
  const to = cues.find((c) => c.index === toIndex)
  const next = cues.map((c) => {
    if (c.index === fromIndex) return { ...c, index: toIndex, label: `${toIndex + 1}` }
    if (to && c.index === toIndex) return { ...c, index: fromIndex, label: `${fromIndex + 1}` }
    return c
  })
  return next.sort((a, b) => a.index - b.index)
}
