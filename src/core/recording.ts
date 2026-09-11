/**
 * Recording constants and pure session math (v0.7.5). No `AudioContext`, no
 * DOM, no File System Access — those live in `platform/recorder-fsaccess/`
 * and `platform/audio-webaudio/`. This file only turns byte counts and
 * marker timestamps into the numbers the UI and the file-splitter need.
 */

/**
 * A calibration constant, not a preference — same category as
 * `PLATTER_SIZE`/`DECLICK_SEC` in `core/settings.ts`, and excluded from the
 * Settings screen for the same reason (v0.2.5's rule): letting the owner
 * raise this is a polite way to let the recording buffer exhaust the tab's
 * memory. 3 hours covers a real DJ set (Shalom's own decision, 2026-09-10)
 * with room to spare; a set that runs longer stops itself and says so by
 * name — see `estimateSecondsRemaining` and the spec's "never skip
 * silently" requirement — rather than crashing when the browser runs out.
 */
export const MASTER_RECORDING_MAX_SEC = 3 * 60 * 60

/**
 * A sampler slot is a live-grabbed moment, not a second master recording —
 * capped far tighter so a forgotten "stop" doesn't quietly turn a pad into
 * a multi-gigabyte in-memory buffer.
 */
export const SAMPLER_CAPTURE_MAX_SEC = 5 * 60

export function bytesPerSecond(sampleRate: number, channels: number, bitsPerSample = 16): number {
  return sampleRate * channels * (bitsPerSample / 8)
}

/** Total bytes `maxSec` of audio occupies at this format — the cap `estimateSecondsRemaining` counts down to. */
export function maxRecordingBytes(
  maxSec: number,
  sampleRate: number,
  channels: number,
  bitsPerSample = 16,
): number {
  return bytesPerSecond(sampleRate, channels, bitsPerSample) * maxSec
}

/**
 * Seconds left before a recording hits its cap, from bytes accumulated so
 * far. Never negative — a recording that already reached the cap reads as
 * "0 seconds left", not a negative countdown.
 */
export function estimateSecondsRemaining(
  bytesRecorded: number,
  maxSec: number,
  sampleRate: number,
  channels: number,
  bitsPerSample = 16,
): number {
  const bps = bytesPerSecond(sampleRate, channels, bitsPerSample)
  const max = maxRecordingBytes(maxSec, sampleRate, channels, bitsPerSample)
  return Math.max(0, (max - bytesRecorded) / bps)
}

export interface RecordingSegment {
  startFrame: number
  endFrame: number
}

/**
 * Turns "mark track here" timestamps into frame ranges for
 * `saveSplitMasterRecording`. Boundaries are sorted (the owner can mark out
 * of order if the UI ever allows it), deduplicated, and clamped to
 * `[0, totalFrames]` — an unsorted or out-of-range marker must not produce
 * a zero-length or reversed file. No boundaries in range means one segment
 * covering the whole recording, which is what "no markers were placed"
 * should produce: the single-file case, not zero files.
 */
export function splitByTrackBoundaries(
  totalFrames: number,
  boundariesSec: number[],
  sampleRate: number,
): RecordingSegment[] {
  const cuts = Array.from(
    new Set(
      boundariesSec
        .map((s) => Math.round(s * sampleRate))
        .filter((f) => f > 0 && f < totalFrames),
    ),
  ).sort((a, b) => a - b)

  const bounds = [0, ...cuts, totalFrames]
  const segments: RecordingSegment[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    segments.push({ startFrame: bounds[i], endFrame: bounds[i + 1] })
  }
  return segments
}
