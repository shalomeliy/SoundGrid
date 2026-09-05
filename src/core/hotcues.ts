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
/**
 * A label nobody has renamed yet — always exactly the pad's own ordinal, set
 * by `setHotCue`. Exported so `controls.ts`'s `pressHotCue` (v0.4.7) can use
 * the same test as `moveHotCue` for "is this a plain jump cue or a saved
 * mix-in point" — one definition, not two that can drift apart.
 */
export function isOrdinalLabel(cue: HotCue): boolean {
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
 * Whether pressing a pad should re-run the automatic transition
 * (`startAutoTransition`) instead of the plain jump-or-create `setHotCue`
 * always does. `controls.ts`'s `pressHotCue` (v0.4.9) calls this *before*
 * deciding — not just "is this a mix-in pad" — because a mix-in pad must
 * never become strictly worse than a plain one: if a transition genuinely
 * can't make sense right now (this deck is already playing, or there's
 * nothing on the other deck to mix from), pressing it should still fall
 * through to the ordinary seek, exactly like every other pad, rather than a
 * dead warning notice and no seek at all. `startAutoTransition`'s own other
 * refusals (no beat grid, a transition already running) still apply and
 * still show their own notice once this returns `true` — this only guards
 * the cases where attempting a transition was never the right call.
 */
export function shouldTriggerMixEntry(
  cue: HotCue | undefined,
  deckPlaying: boolean,
  otherDeckPlaying: boolean,
): boolean {
  return !!cue && !isOrdinalLabel(cue) && !deckPlaying && otherDeckPlaying
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
