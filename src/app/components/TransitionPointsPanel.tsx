import { useMemo } from 'react'
import { findTransitionCandidates, type StructureReason } from '@/core/structure'
import type { BeatGrid } from '@/core/types'
import { Pill } from '@/app/components/controls'

/**
 * Mix Assist (v0.4.6), build step 6: the popover that lists this deck's own
 * candidate mix-in points, once it is loaded and paused while the other deck
 * plays. Picking a point is meant to be the flow's second and last click
 * (ROADMAP.md v0.4.6, "בחירת נקודה היא הקליק השני והאחרון") — so this panel
 * is shown automatically whenever it applies, never behind an extra open
 * click of its own. `onSelect` only seeks the deck for now: `startAutoTransition`
 * (step 7) does not exist yet, so a plain seek is the honest, complete thing
 * this step can already do — a preview of where the autonomous join will
 * later start from, not a stub.
 *
 * The "based on energy" wording is load-bearing, not decoration: this is an
 * RMS-envelope heuristic, never real structure detection (see the doc
 * comment on `core/structure.ts` itself), and every label here — the panel
 * title, each point's reason — has to say so in the same words.
 */

const REASON_LABEL: Record<StructureReason, string> = {
  'energy-builds': 'past the intro — energy builds',
  'energy-drops': 'into the outro — energy drops',
  'quiet-passage': 'quiet passage — energy dips',
}

function fmtSec(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Props {
  bands: Float32Array | null
  durationSec: number
  beatGrid: BeatGrid | null
  /** This deck's own load-time analysis failed — distinct from "still running". */
  analysisFailed: boolean
  onSelect: (sec: number) => void
}

export function TransitionPointsPanel({ bands, durationSec, beatGrid, analysisFailed, onSelect }: Props) {
  // bands stays null until *this deck's* load-time analysis resolves
  // (`controls.ts`'s `loadTrackToDeck`) — independent of the track's
  // library-wide `analysisState`, which can already read "analyzed" from an
  // earlier background pass while this specific deck load is still running.
  const candidates = useMemo(
    () => (bands ? findTransitionCandidates(bands, durationSec, beatGrid) : []),
    [bands, durationSec, beatGrid],
  )

  return (
    <div
      className="absolute left-0 top-full z-30 mt-1 w-72 rounded-[var(--radius-md)] border border-hairline bg-surface-2 p-2.5 text-left shadow-[var(--shadow-pop)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 label">Transition points — based on energy</div>
      {bands === null ? (
        <div className="text-2xs text-grid-muted">
          {analysisFailed
            ? 'Analysis failed — you can still play it in manually.'
            : 'Still analyzing…'}
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-2xs text-grid-muted">
          No clear transition points found — energy stays roughly constant throughout.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {candidates.map((c) => (
            <button
              key={`${c.reason}-${c.sec}`}
              type="button"
              onClick={() => onSelect(c.sec)}
              className="rounded-full text-left transition-opacity hover:opacity-80"
            >
              <Pill tone="idle" label={`${fmtSec(c.sec)} · ${REASON_LABEL[c.reason]}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
