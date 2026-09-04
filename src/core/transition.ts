import { phaseDeltaSec } from '@/core/beatgrid'
import type { BeatGrid } from '@/core/types'

/**
 * Pure math for the autonomous Mix Assist transition (v0.4.6): the crossfade
 * curve and the one-shot phase-join seek offset. Everything here is a plain
 * function of numbers — no `AudioContext`, no store, no timers — so it can be
 * unit-tested without a running engine, the same split `core/beatgrid.ts`
 * already made for phase math.
 */

export interface CrossfadeGains {
  /** gain for the deck the transition starts from */
  fromGain: number
  /** gain for the deck the transition moves to */
  toGain: number
}

/**
 * Equal-power crossfade at `progress` (0 = fully on the "from" deck, 1 =
 * fully on the "to" deck) — the same cosine law as
 * `platform/audio-webaudio/engine.ts`'s `setCrossfader`, so an autonomous
 * transition sounds like the same crossfader the user's hand already knows,
 * not a second, different-feeling fade.
 */
export function crossfadeGains(progress: number): CrossfadeGains {
  const t = Math.min(1, Math.max(0, progress))
  return {
    fromGain: Math.cos((t * Math.PI) / 2),
    toGain: Math.sin((t * Math.PI) / 2),
  }
}

/** Elapsed time as a 0..1 progress fraction of a fixed-duration crossfade. */
export function crossfadeProgress(elapsedSec: number, durationSec: number): number {
  if (durationSec <= 0) return 1
  return Math.min(1, Math.max(0, elapsedSec / durationSec))
}

/**
 * Where to actually start (seek) the incoming deck so that, played from
 * there, its beat phase already matches the outgoing/master deck's phase at
 * this instant — "seek-then-sync" (ROADMAP.md v0.4.6): the join happens
 * while the incoming deck is still inaudible (full crossfade on the outgoing
 * side), so this one silent seek replaces relying on the ongoing sync loop
 * (`controls.ts`'s `ensureSyncLoop`) to converge from a cold, unaligned
 * start — its constants are tuned for small continuous drift, not a fresh
 * join (see `HANDOFF.md`'s note on `MAX_SYNC_BEND` being unmeasured for this).
 *
 * Reuses `phaseDeltaSec` as-is: that function already returns the smallest
 * signed move (never more than half a beat) to bring one position onto
 * another grid's phase, which is exactly what a one-shot seek offset needs.
 */
export function phaseAlignedEntrySec(
  entrySec: number,
  incomingGrid: BeatGrid,
  masterPositionSec: number,
  masterGrid: BeatGrid,
): number {
  return entrySec + phaseDeltaSec(entrySec, incomingGrid, masterPositionSec, masterGrid)
}
