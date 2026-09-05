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
/** A label nobody has renamed yet — always exactly the pad's own ordinal, set by `setHotCue`. */
function isOrdinalLabel(cue: HotCue): boolean {
  return cue.label === `${cue.index + 1}`
}

export function moveHotCue(cues: HotCue[], fromIndex: number, toIndex: number): HotCue[] {
  if (fromIndex === toIndex) return cues
  const from = cues.find((c) => c.index === fromIndex)
  if (!from) return cues
  const to = cues.find((c) => c.index === toIndex)
  // A plain numbered cue keeps its label in sync with wherever it lands
  // (unchanged since v0.4.0). A cue carrying a v0.4.7 descriptive name
  // (`saveMixEntryHotCue`) keeps that name instead — relabeling it to a bare
  // number on every drag would erase it silently, which this project's
  // central rule forbids just as much for a name as for a skipped file.
  const next = cues.map((c) => {
    if (c.index === fromIndex) {
      return { ...c, index: toIndex, label: isOrdinalLabel(c) ? `${toIndex + 1}` : c.label }
    }
    if (to && c.index === toIndex) {
      return { ...c, index: fromIndex, label: isOrdinalLabel(c) ? `${fromIndex + 1}` : c.label }
    }
    return c
  })
  return next.sort((a, b) => a.index - b.index)
}

/**
 * Which pad `saveMixEntryHotCue` (v0.4.7, `controls.ts`) should write to: the
 * first empty one (0..7, in order), or — when all 8 are already occupied —
 * the one with the oldest `createdAt` (missing `createdAt` counts as oldest
 * of all, per `HotCue`'s own doc comment). This eviction is always visible:
 * the pad it lands on changes in the Pad Grid immediately, never silently.
 */
export function pickHotCueSlot(cues: HotCue[]): number {
  for (let i = 0; i < 8; i++) {
    if (!cues.some((c) => c.index === i)) return i
  }
  let oldest = cues[0]
  for (const c of cues) {
    if ((c.createdAt ?? 0) < (oldest.createdAt ?? 0)) oldest = c
  }
  return oldest.index
}
