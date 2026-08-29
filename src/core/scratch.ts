/**
 * Platter and playhead maths, kept out of the components so it can be tested.
 *
 * These lived inside `Platter.tsx` and `useRenderLoop.ts`, where nothing could
 * reach them: the first two bugs below were both found by reading the code in
 * v0.2.0's own plan and then never fixed, because there was no cheap way to
 * demonstrate them. Pure functions in `core/` are that way.
 */

/** One revolution of the platter equals this much audio at normal speed. */
export const SEC_PER_REV = 1.333

/** A flick should not command an absurd rate. */
export const MAX_RATE = 8

/**
 * Pointer samples are jittery, so the rate is smoothed. Low enough to follow a
 * fast scratch, high enough that a steady drag does not shimmer.
 */
export const SMOOTHING = 0.4

/**
 * Horizontal travel for one revolution, from the platter's own diameter: the
 * distance a finger covers going once around the rim. Scaling with size is the
 * point — a bigger platter should need more travel per revolution, exactly as a
 * bigger record does.
 */
export const pxPerRev = (platterSize: number): number => Math.PI * platterSize

/**
 * Drag distance → playback rate.
 *
 * **Horizontal travel, not swept angle.** The platter used `atan2`, which makes
 * the gain depend on where the platter was grabbed: on a 54px platter 1px near
 * the centre is 5.7° and 1px at the rim is 0.77° — a 7× difference in how hard
 * the same movement scratches, with nothing on screen to explain it. `Knob`
 * already drags in a straight line on a round control for this reason.
 *
 * `dtSec <= 0` and a non-positive `platterSize` return the previous rate rather
 * than dividing by zero: two pointer events can share a millisecond, and a
 * platter with no size is a caller bug that must not become an infinite rate.
 */
export function scratchRateFromDrag(
  dxPx: number,
  dtSec: number,
  platterSize: number,
  prevRate: number,
): number {
  if (dtSec <= 0 || platterSize <= 0) return prevRate
  const revs = dxPx / pxPerRev(platterSize)
  const instant = (revs * SEC_PER_REV) / dtSec
  const smoothed = prevRate + (instant - prevRate) * SMOOTHING
  return Math.max(-MAX_RATE, Math.min(MAX_RATE, smoothed))
}

/**
 * Below this, a playhead move is not worth a store write and a re-render.
 * At normal speed a frame advances ~16ms of audio, so this filters noise only.
 */
export const POSITION_EPSILON_SEC = 0.001

/**
 * Whether the render loop should push a new playhead position to the store.
 *
 * The epsilon was absolute, and that froze the platter under a slow scratch:
 * at rate 0.05 the playhead moves 0.0008s per frame — under the threshold — so
 * the audio moved and the marker sat still, which reads as the scratch not
 * working at all. While a hand is on the platter every change is worth showing,
 * because the hand is asking for exactly this feedback.
 */
export function shouldPushPosition(
  positionSec: number,
  storedSec: number,
  scratching: boolean,
): boolean {
  return scratching
    ? positionSec !== storedSec
    : Math.abs(positionSec - storedSec) > POSITION_EPSILON_SEC
}
