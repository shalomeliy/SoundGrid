import type { BeatGrid } from '@/core/types'

/**
 * Beat-grid detection, phase, and quantize math — kept out of `platform/` so it
 * can be tested without an `AudioContext`, the same move `core/scratch.ts` made
 * for platter math in v0.2.2. `platform/analyzer-js/analyze.ts` still owns turning
 * an `AudioBuffer` into an onset envelope (that part touches the DOM API and has
 * to stay platform-side); everything from the envelope onward is pure and lives
 * here.
 *
 * What this can and cannot find, stated plainly rather than left to be assumed:
 * an onset envelope can locate *beat* phase (where in each `60/bpm`-second cycle
 * the energy peaks) but not *bar* phase — telling beat 1 of a bar from beats 2-4
 * needs kick/snare timbre analysis this does not do. So `estimateBeatGrid` finds
 * the nearest beat, not the nearest downbeat-of-a-bar; `setDownbeatAt` is the
 * manual tool for a user who cares which beat is bar-1.
 */

/**
 * `x` folded into `[0, period)`. `%` alone leaves negative results negative.
 * Only adds `period` back when the plain `%` came out negative — adding it
 * unconditionally (`((x % period) + period) % period`) puts an already-in-range
 * value through a second lossy subtraction for nothing, which is what turned
 * `0.2` into `0.19999999999999996` here before this was narrowed to the one
 * case that actually needs the correction.
 */
function foldInto(x: number, period: number): number {
  const r = x % period
  return r < 0 ? r + period : r
}

/** Fractional part of `x`, always in `[0, 1)` — `%` alone leaves it signed. */
function frac01(x: number): number {
  return x - Math.floor(x)
}

/** How far the largest value stands out from the average of all of them. */
function peakToMeanRatio(values: number[], peakIndex: number): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean <= 1e-9) return 0
  return values[peakIndex] / mean
}

/**
 * Below this ratio, the strongest candidate is not a real periodicity — a flat
 * onset envelope (silence, a spoken-word track, a clip too short to repeat a
 * beat) scores every candidate about the same, and picking the top one anyway
 * would be exactly the silent-wrong-answer this project's "never skip silently"
 * rule forbids. Chosen, not measured: revisit once real tracks are checked
 * against it (see HANDOFF.md — this whole module's constants are provisional
 * until verified against the user's library).
 */
const CONFIDENCE_RATIO = 1.15

export interface BeatGridEstimate {
  grid: BeatGrid
  confident: boolean
}

/**
 * Estimate a beat grid from an onset envelope.
 *
 * `onsets` is a positive-only difference envelope (see `analyze.ts`'s
 * `buildOnsetEnvelope`), sampled at `framesPerSec`. BPM comes from the same
 * lag-autocorrelation scoring `detectBpm` used before this module existed — it
 * was already pure, only ever touching `onsets`, so it moved here unchanged.
 * Phase is new: onset energy is folded modulo the winning beat period into
 * `beatFrames` bins across the whole track, and the strongest bin is beat 0.
 *
 * Returns `null` only when there is not enough envelope to say anything at all
 * (mirrors `detectBpm`'s old `env.length < 64` guard). A flat/unconvincing
 * envelope still returns a grid — the best guess autocorrelation could make —
 * with `confident: false`, so the caller has something to show and quantize
 * against rather than nothing, while still being honest that it's a guess.
 */
export function estimateBeatGrid(
  onsets: Float32Array,
  framesPerSec: number,
  opts?: { minBpm?: number; maxBpm?: number },
): BeatGridEstimate | null {
  if (onsets.length < 64) return null
  const min = opts?.minBpm ?? 80
  const max = opts?.maxBpm ?? 180

  const candidates: number[] = []
  const scores: number[] = []
  let bestIdx = 0
  let bestScore = -Infinity
  for (let bpm = min; bpm <= max; bpm += 0.5) {
    const lag = Math.round((60 / bpm) * framesPerSec)
    let score = 0
    for (let i = lag; i < onsets.length; i++) score += onsets[i] * onsets[i - lag]
    score /= onsets.length - lag
    candidates.push(bpm)
    scores.push(score)
    if (score > bestScore) {
      bestScore = score
      bestIdx = candidates.length - 1
    }
  }
  const bpm = Math.round(candidates[bestIdx] * 10) / 10
  const bpmConfident = peakToMeanRatio(scores, bestIdx) >= CONFIDENCE_RATIO

  const beatFrames = Math.max(1, Math.round((60 / bpm) * framesPerSec))
  const bins = new Array<number>(beatFrames).fill(0)
  for (let i = 0; i < onsets.length; i++) bins[i % beatFrames] += onsets[i]
  let bestBin = 0
  for (let b = 1; b < bins.length; b++) if (bins[b] > bins[bestBin]) bestBin = b
  const phaseConfident = peakToMeanRatio(bins, bestBin) >= CONFIDENCE_RATIO

  const offsetSec = bestBin / framesPerSec
  return {
    grid: { bpm, offsetSec },
    confident: bpmConfident && phaseConfident,
  }
}

/** Nearest beat to `sec` on `grid` — what quantize snaps to. */
export function quantizeToGrid(sec: number, grid: BeatGrid): number {
  const beatSec = 60 / grid.bpm
  const beatIndex = Math.round((sec - grid.offsetSec) / beatSec)
  return grid.offsetSec + beatIndex * beatSec
}

/**
 * Signed correction, in the deck's own seconds, to bring `deckPositionSec` onto
 * `masterGrid`'s beat phase — the smallest move either forward or back, never
 * more than half a beat. Phase is compared as a *fraction* of each deck's own
 * beat cycle rather than as raw elapsed time, which is what makes this robust
 * to the two decks having slightly different detected BPMs even after SYNC's
 * tempo fader has matched their playback rates: 0.1 BPM of detection error is
 * exactly the kind of gap this function is meant to keep closing, tick after
 * tick, rather than something it can assume away.
 */
export function phaseDeltaSec(
  deckPositionSec: number,
  deckGrid: BeatGrid,
  masterPositionSec: number,
  masterGrid: BeatGrid,
): number {
  const deckBeatSec = 60 / deckGrid.bpm
  const masterBeatSec = 60 / masterGrid.bpm
  const deckPhase = frac01((deckPositionSec - deckGrid.offsetSec) / deckBeatSec)
  const masterPhase = frac01((masterPositionSec - masterGrid.offsetSec) / masterBeatSec)
  let diff = masterPhase - deckPhase
  diff -= Math.round(diff)
  return diff * deckBeatSec
}

/** Corrects an octave-low BPM guess (the detector locked onto every other beat). */
export function halveGrid(grid: BeatGrid): BeatGrid {
  return { bpm: grid.bpm / 2, offsetSec: grid.offsetSec }
}

/** Corrects an octave-high BPM guess (the detector locked onto a subdivision). */
export function doubleGrid(grid: BeatGrid): BeatGrid {
  const bpm = grid.bpm * 2
  return { bpm, offsetSec: foldInto(grid.offsetSec, 60 / bpm) }
}

/** Nudge the grid's phase by `deltaSec`, wrapped back into one beat period. */
export function shiftGrid(grid: BeatGrid, deltaSec: number): BeatGrid {
  return { bpm: grid.bpm, offsetSec: foldInto(grid.offsetSec + deltaSec, 60 / grid.bpm) }
}

/** A new grid whose beat 0 lands exactly at `markSec`, at the given `bpm`. */
export function setDownbeatAt(bpm: number, markSec: number): BeatGrid {
  return { bpm, offsetSec: foldInto(markSec, 60 / bpm) }
}

/**
 * BPM from tap-tempo timestamps (seconds, e.g. `performance.now() / 1000`).
 * Uses the median inter-tap interval to reject one fat-fingered tap without
 * needing the caller to already know which one was bad, then averages whatever
 * intervals survive that filter. `null` until there are at least two taps to
 * form an interval from.
 */
export function bpmFromTaps(tapTimesSec: number[]): number | null {
  if (tapTimesSec.length < 2) return null
  const intervals: number[] = []
  for (let i = 1; i < tapTimesSec.length; i++) {
    const d = tapTimesSec[i] - tapTimesSec[i - 1]
    if (d > 0) intervals.push(d)
  }
  if (intervals.length === 0) return null
  const sorted = [...intervals].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const kept = intervals.filter((d) => Math.abs(d - median) / median < 0.3)
  const use = kept.length > 0 ? kept : intervals
  const mean = use.reduce((a, b) => a + b, 0) / use.length
  return Math.round((60 / mean) * 10) / 10
}
