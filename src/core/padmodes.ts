/**
 * Pure pad-mode math (v0.5.0) — Beat Jump seek distance and Loop Roll's
 * catch-up return point. No React, no DOM, no AudioContext, no store: the
 * same "extracted for real unit tests" move `beatgrid.ts`/`hotcues.ts`
 * already made. `controls.ts` owns everything that needs the engine or the
 * store (tempo-adjusted elapsed time, quantize, notices).
 */

/**
 * Loop/Beat Jump pad lengths, in beats — one per pad, geometric like the
 * existing `setLoopBeats` ÷2/×2 stepper (`controls.ts`), and clamped to the
 * same [0.25, 32] range that stepper already enforces, plus two longer
 * steps for Beat Jump's longer-distance use.
 */
export const LOOP_BEATS_STEPS = [0.25, 0.5, 1, 2, 4, 8, 16, 32] as const

/**
 * Where a Beat Jump of `beats` in `direction` lands, clamped to the track's
 * own bounds. The clamp is a boundary, not a skip — nothing is hidden, the
 * playhead just stops where the track does, the same way `seekDeck`'s own
 * `deck.seek` clamp already behaves.
 */
export function beatJumpTargetSec(
  positionSec: number,
  bpm: number,
  beats: number,
  direction: 1 | -1,
  durationSec: number,
): number {
  const target = positionSec + direction * beats * (60 / bpm)
  return Math.max(0, Math.min(durationSec, target))
}

/**
 * Loop Roll's release point: where the track "catches up" to, as if it had
 * never looped. `entrySec` is the position when the roll started; `elapsedSec`
 * is how far the track would have played since then at its actual playback
 * rate (the caller multiplies real elapsed time by tempo — this function
 * knows nothing about tempo or the engine, only the arithmetic). Clamped to
 * the track's bounds for the same reason `beatJumpTargetSec` is.
 */
export function loopRollReturnSec(entrySec: number, elapsedSec: number, durationSec: number): number {
  return Math.max(0, Math.min(durationSec, entrySec + elapsedSec))
}
