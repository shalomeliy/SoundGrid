import { quantizeToGrid } from '@/core/beatgrid'
import type { BeatGrid } from '@/core/types'

/**
 * Candidate mix-transition points from the track's own energy contour.
 *
 * This is deliberately *not* structure detection: telling an intro from a
 * verse from a drop needs kick/snare timbre analysis this project doesn't do
 * (`core/beatgrid.ts`'s own doc comment: beat phase only, no bar/downbeat).
 * What this finds is sustained rises and falls in the already-computed
 * low/mid/high RMS envelope (`platform/analyzer-js/analyze.ts`'s `bands`) — a
 * loudness-contour heuristic, not a musical one. The UI must say so in these
 * exact terms ("based on energy", never "structure detected"/"intro"/
 * "outro") — see ROADMAP.md v0.4.6.
 */
export type StructureReason = 'energy-builds' | 'energy-drops' | 'quiet-passage'

export interface StructureCandidate {
  sec: number
  reason: StructureReason
}

/**
 * Below this fraction of the track's own near-peak sustained level, a
 * window counts as "quiet". Chosen, not measured — same status as
 * `beatgrid.ts`'s `CONFIDENCE_RATIO` until checked against real tracks.
 */
const ENERGY_THRESHOLD_RATIO = 0.55

/** A rise/fall must hold for this long to count as a real transition, not a transient. */
const MIN_SUSTAIN_SEC = 4

/** Coarse analysis window — the raw `bands` buckets (~5ms apart) are far too fine-grained to threshold directly. */
const WINDOW_SEC = 1

/**
 * Per-second combined loudness (low+mid+high RMS summed), downsampled from
 * the fine-grained `bands` buckets analysis already computed at load time.
 */
function energyContour(bands: Float32Array, durationSec: number): number[] {
  const bucketCount = Math.floor(bands.length / 3)
  if (bucketCount === 0 || durationSec <= 0) return []
  const secPerBucket = durationSec / bucketCount
  const bucketsPerWindow = Math.max(1, Math.round(WINDOW_SEC / secPerBucket))
  const windows = Math.ceil(bucketCount / bucketsPerWindow)
  const out = new Array<number>(windows).fill(0)
  for (let w = 0; w < windows; w++) {
    const start = w * bucketsPerWindow
    const end = Math.min(bucketCount, start + bucketsPerWindow)
    let sum = 0
    for (let i = start; i < end; i++) sum += bands[i * 3] + bands[i * 3 + 1] + bands[i * 3 + 2]
    out[w] = sum / Math.max(1, end - start)
  }
  return out
}

/** 90th percentile — resistant to a single loud transient the way a bare max isn't. */
function nearPeakLevel(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length * 0.9)]
}

/**
 * Find candidate mix-transition points on `bands` (from `analyzeWaveform`,
 * `platform/analyzer-js/analyze.ts`), quantized to `grid` when one is known.
 * Returns an empty array — never a fabricated guess — when the track's
 * energy stays roughly constant throughout (ambient, ultra-flat masters):
 * the "never skip silently" rule cuts both ways, and inventing a point here
 * would overstate what this heuristic actually found.
 */
export function findTransitionCandidates(
  bands: Float32Array,
  durationSec: number,
  grid: BeatGrid | null,
): StructureCandidate[] {
  const contour = energyContour(bands, durationSec)
  if (contour.length === 0) return []
  const windowSec = durationSec / contour.length
  const minWindows = Math.max(1, Math.round(MIN_SUSTAIN_SEC / windowSec))
  const peak = nearPeakLevel(contour)
  if (peak <= 1e-6) return []
  const threshold = peak * ENERGY_THRESHOLD_RATIO

  const sustainedFrom = (i: number, above: boolean): boolean => {
    if (i + minWindows > contour.length) return false
    for (let k = i; k < i + minWindows; k++) {
      if (above ? contour[k] < threshold : contour[k] >= threshold) return false
    }
    return true
  }

  const candidates: StructureCandidate[] = []

  // Earliest sustained rise — a candidate "past the intro" point. Requires an
  // actual boundary (the window right before was below threshold); otherwise
  // a track that is loud from second 0 would falsely register a "rise" at
  // i=0, when there is nothing before it to have risen from.
  for (let i = 1; i < contour.length; i++) {
    if (contour[i - 1] < threshold && sustainedFrom(i, true)) {
      candidates.push({ sec: i * windowSec, reason: 'energy-builds' })
      break
    }
  }

  // Latest sustained fall, scanning from the end — a candidate "into the
  // outro" point. Same boundary requirement, mirrored.
  for (let i = contour.length - minWindows; i >= 1; i--) {
    if (contour[i - 1] >= threshold && sustainedFrom(i, false)) {
      candidates.push({ sec: i * windowSec, reason: 'energy-drops' })
      break
    }
  }

  // A quiet passage inside the track (not near either end), if one exists.
  const midStart = Math.max(1, Math.floor(contour.length * 0.2))
  const midEnd = Math.ceil(contour.length * 0.8)
  for (let i = midStart; i < midEnd; i++) {
    if (contour[i - 1] >= threshold && sustainedFrom(i, false)) {
      candidates.push({ sec: i * windowSec, reason: 'quiet-passage' })
      break
    }
  }

  if (!grid) return candidates
  return candidates.map((c) => ({ ...c, sec: quantizeToGrid(c.sec, grid) }))
}
