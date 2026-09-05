import { useEffect, useRef, useState } from 'react'
import * as ctl from '@/controls'
import { LONG_PRESS_MS, PLATTER_SIZE } from '@/core/constants'
import { useSettings } from '@/app/hooks/useSettings'
import { useStore } from '@/app/state/store'
import type { DeckId } from '@/core/types'
import { Button, Fader, HintIcon, Pill } from '@/app/components/controls'
import { BeatGridPanel } from '@/app/components/BeatGridPanel'
import { PadGrid } from '@/app/components/PadGrid'
import { Platter } from '@/app/components/Platter'
import { TransitionPointsPanel } from '@/app/components/TransitionPointsPanel'
import { Waveform } from '@/app/components/Waveform'

const DECK_COLOR: Record<DeckId, string> = { A: 'var(--color-deck-a)', B: 'var(--color-deck-b)' }

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Deck({ deckId }: { deckId: DeckId }) {
  const deck = useStore((s) => s.decks[deckId])
  const otherDeckId: DeckId = deckId === 'A' ? 'B' : 'A'
  const otherPlaying = useStore((s) => s.decks[otherDeckId].playing)
  const otherBands = useStore((s) => s.decks[otherDeckId].bands)
  const otherDurationSec = useStore((s) => s.decks[otherDeckId].durationSec)
  // Floored *in the selector*, not after — `useRenderLoop` writes the other
  // deck's raw `positionSec` every frame regardless of whether this panel is
  // showing anything, so selecting the raw value here would re-render this
  // whole Deck at frame rate any time the other deck plays. Selecting the
  // already-floored number means Zustand's own equality check only sees a
  // change once a second, matching the ~1s resolution the comparison itself
  // has (`TransitionPointsPanel`'s own energy contour).
  const otherPositionBucketSec = useStore((s) => Math.floor(s.decks[otherDeckId].positionSec))
  const otherAnalysisFailed = useStore((s) => s.decks[otherDeckId].track?.analysisState === 'failed')
  const color = DECK_COLOR[deckId]
  const loaded = !!deck.track
  // Mix Assist (v0.4.6): relevant exactly when this deck is the one about to
  // be brought in — loaded, not already playing, while the other deck is the
  // reference it would join against. Neither deck playing, or this one
  // already playing, and there is nothing to show a mix-in point for.
  // `!deck.loading` matters on its own: `loadTrackToDeck` (controls.ts)
  // leaves the *previous* track's `bands`/`beatGrid` in place until the new
  // one's decode finishes and patches everything atomically — without this
  // check, loading a new track over an already-eligible deck would keep
  // showing the outgoing track's candidate points during that window.
  const showTransitionPoints = loaded && !deck.loading && !deck.playing && otherPlaying
  const [dropActive, setDropActive] = useState(false)
  const [gridPanelOpen, setGridPanelOpen] = useState(false)
  const closeGridPanel = () => {
    setGridPanelOpen(false)
    // Closing without an edit still counts as "the user checked it."
    ctl.confirmBeatGrid(deckId)
  }
  useEffect(() => {
    if (!gridPanelOpen) return
    const onDocClick = () => closeGridPanel()
    // Next tick: otherwise the same click that opened it closes it right back.
    const id = window.setTimeout(() => document.addEventListener('click', onDocClick), 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('click', onDocClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridPanelOpen])

  // SYNC: a tap toggles phase-lock to the master deck; a long-press makes
  // this deck the master instead (v0.3.0). Mirrors Platter.tsx's hold-timer
  // idiom (a ref, not state, since the timer firing shouldn't re-render) and
  // the CUE button's window-level pointerup listener just below — the
  // release has to be caught even if the pointer drifted off the button
  // first, the same reason CUE doesn't rely on onPointerUp alone.
  const syncHoldTimer = useRef(0)
  const syncLongFired = useRef(false)
  useEffect(() => () => window.clearTimeout(syncHoldTimer.current), [])
  const onSyncDown = () => {
    syncLongFired.current = false
    window.clearTimeout(syncHoldTimer.current)
    syncHoldTimer.current = window.setTimeout(() => {
      syncLongFired.current = true
      ctl.setMasterDeck(deckId)
    }, LONG_PRESS_MS)
    const up = () => {
      window.clearTimeout(syncHoldTimer.current)
      if (!syncLongFired.current) ctl.syncDeck(deckId)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointerup', up)
  }

  const TRACK_MIME = 'application/x-soundgrid-track'
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropActive(false)
    const id = e.dataTransfer.getData(TRACK_MIME)
    const track = useStore.getState().library.tracks.find((t) => t.id === id)
    if (track) void ctl.loadTrackToDeck(deckId, track)
  }
  // Tempo range and BPM precision are the user's from v0.2.5. The fader's
  // -1..1 value is unchanged by the range; what it means in percent is not.
  const { tempoRange, bpmDecimals } = useSettings()
  const effectiveBpm = deck.bpm != null ? deck.bpm * (1 + deck.tempo * tempoRange) : null
  const deltaPct = deck.tempo * tempoRange * 100
  const remain = deck.durationSec - deck.positionSec

  return (
    <section
      className="panel relative flex min-h-0 min-w-0 flex-col gap-2 p-2.5 transition-shadow"
      style={dropActive ? { boxShadow: `0 0 0 2px ${color}, var(--shadow-panel)` } : undefined}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(TRACK_MIME)) {
          e.preventDefault()
          setDropActive(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false)
      }}
      onDrop={onDrop}
    >
      {dropActive && (
        <div
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-[var(--radius-lg)] text-sm font-semibold"
          style={{ background: 'color-mix(in srgb, var(--color-surface-0), transparent 25%)', color }}
        >
          Drop to load deck {deckId}
        </div>
      )}
      {/* identity + primary readouts ------------------------------------ */}
      <header className="flex items-start gap-3">
        <span
          className="mt-0.5 grid h-6 w-6 place-items-center rounded-[var(--radius-sm)] text-sm font-bold text-black"
          style={{ background: color }}
        >
          {deckId}
        </span>
        <div className="relative min-w-0 flex-1">
          <div
            className={`truncate text-base font-semibold leading-tight ${
              loaded ? '' : 'text-grid-dim'
            }`}
          >
            {deck.loading ? 'Loading track…' : (deck.track?.name ?? 'No track loaded')}
          </div>
          <div className="tnum mt-0.5 flex items-center gap-2 text-xs text-grid-muted">
            <span className="uppercase tracking-wide">{deck.track?.kind ?? '—'}</span>
            {loaded && (
              <>
                <span aria-hidden>·</span>
                <span>{fmt(deck.positionSec)}</span>
                <span className="text-grid-dim">/ {fmt(deck.durationSec)}</span>
                <span className={remain <= 30 && remain > 0 ? 'text-warn' : 'text-grid-dim'}>
                  −{fmt(remain)}
                </span>
              </>
            )}
          </div>
          {showTransitionPoints && (
            <TransitionPointsPanel
              bands={deck.bands}
              durationSec={deck.durationSec}
              beatGrid={deck.beatGrid}
              analysisFailed={deck.track?.analysisState === 'failed'}
              otherDeckId={otherDeckId}
              otherBands={otherBands}
              otherDurationSec={otherDurationSec}
              otherPositionBucketSec={otherPositionBucketSec}
              otherAnalysisFailed={otherAnalysisFailed}
              onSelect={(sec) => {
                // Both calls act on the same chosen point: the transition
                // starts immediately (unchanged since v0.4.6), and the point
                // is also saved as a hot cue so it's there next time this
                // track loads (v0.4.7) — approved together, not sequenced.
                ctl.startAutoTransition(otherDeckId, deckId, sec)
                ctl.saveMixEntryHotCue(deckId, sec, 'Mix in')
              }}
            />
          )}
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            className="text-right disabled:cursor-not-allowed"
            onClick={() => {
              if (!loaded) return
              if (gridPanelOpen) closeGridPanel()
              else setGridPanelOpen(true)
            }}
            disabled={!loaded}
            aria-label="Edit beat grid"
            aria-expanded={gridPanelOpen}
          >
            <div
              className="tnum text-xl font-semibold leading-none"
              style={{ color: effectiveBpm ? color : 'var(--color-grid-dim)' }}
            >
              {effectiveBpm ? effectiveBpm.toFixed(bpmDecimals) : '—'}
            </div>
            <div className="tnum mt-0.5 text-2xs text-grid-muted">
              BPM
              {deltaPct !== 0 && (
                <span className="ml-1 text-grid-dim">
                  {deltaPct > 0 ? '+' : ''}
                  {deltaPct.toFixed(1)}%
                </span>
              )}
            </div>
          </button>
          {/* Sibling of the button, not a child: HintIcon carries its own
              tabIndex, and HTML forbids any tabindex-bearing descendant of a
              <button> — this div is already `relative`, so the badge anchors
              to it exactly as it would have anchored to the button itself. */}
          <HintIcon id="deck.bpm" className="absolute -top-1 -right-1" />
          {/* A grid detection wasn't confident about, or found nothing at all,
              is shown — never silently trusted (CLAUDE.md's central rule).
              Cleared once the user checks or edits it (BeatGridPanel). */}
          {loaded && !deck.beatGridConfirmed && (
            <div className="mt-1 flex justify-end">
              <Pill tone="warn" label="unconfirmed grid" />
            </div>
          )}
          {gridPanelOpen && (
            <BeatGridPanel deckId={deckId} beatGrid={deck.beatGrid} onClose={closeGridPanel} />
          )}
        </div>
      </header>

      <Waveform
        deckId={deckId}
        peaks={deck.peaks}
        bands={deck.bands}
        positionSec={deck.positionSec}
        durationSec={deck.durationSec}
        bpm={deck.bpm}
        offsetSec={deck.beatGrid?.offsetSec ?? 0}
        hotCues={deck.hotCues}
        color={color}
        loading={deck.loading}
        onSeek={(s) => ctl.seekDeck(deckId, s)}
      />

      <div className="flex gap-3">
        {/* left: transport + pads ------------------------------------- */}
        <div className="flex flex-1 flex-col gap-1.5">
          {/* Each grid cell holds a wrapping span, not the Button directly:
              HintIcon must be a sibling of the button (see the note by
              HintIcon's definition), and the span needs `flex` + the button
              `flex-1` so the button still fills the grid track exactly as it
              did before — a grid item stretches by default, and a plain
              wrapper without this would leave the button its own
              content-width, shrunk to the left of its cell. */}
          <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2">
            <span className="relative flex">
              <Button
                variant="transport"
                className="flex-1"
                onPointerDown={() => {
                  const release = ctl.cuePlayPreview(deckId)
                  const up = () => {
                    release()
                    window.removeEventListener('pointerup', up)
                  }
                  if (!deck.playing) window.addEventListener('pointerup', up)
                  else ctl.cue(deckId)
                }}
                disabled={!loaded}
              >
                Cue
              </Button>
              <HintIcon id="deck.cue" className="absolute -right-1.5 -top-1.5" />
            </span>
            <span className="relative flex">
              <Button
                variant="transport"
                className="flex-1"
                active={deck.playing}
                tone={color}
                onClick={() => ctl.togglePlay(deckId)}
                disabled={!loaded}
              >
                {deck.playing ? 'Pause' : 'Play'}
              </Button>
              <HintIcon id="deck.play" className="absolute -right-1.5 -top-1.5" />
            </span>
            <span className="relative flex">
              <Button
                variant="transport"
                className="flex-1"
                active={deck.syncActive}
                tone={color}
                onPointerDown={onSyncDown}
                disabled={!loaded}
                title="Tap: sync to master. Hold: make this deck master."
              >
                Sync
              </Button>
              <HintIcon id="deck.sync" className="absolute -right-1.5 -top-1.5" />
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="relative inline-flex">
              <Button
                variant="toggle"
                active={deck.loopActive}
                tone={color}
                onClick={() => ctl.toggleLoop(deckId)}
                disabled={!loaded}
              >
                Loop
              </Button>
              <HintIcon id="deck.loop" className="absolute -right-1.5 -top-1.5" />
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => ctl.setLoopBeats(deckId, deck.loopBeats / 2)}
              disabled={!loaded}
            >
              ÷2
            </Button>
            <span className="tnum w-9 text-center text-xs text-grid-muted">{deck.loopBeats}b</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => ctl.setLoopBeats(deckId, deck.loopBeats * 2)}
              disabled={!loaded}
            >
              ×2
            </Button>
            <span className="relative ml-auto inline-flex">
              <Button
                variant="toggle"
                active={deck.cueMonitor}
                tone="var(--color-live)"
                onClick={() => ctl.toggleCueMonitor(deckId)}
              >
                PFL
              </Button>
              <HintIcon id="deck.pfl" className="absolute -right-1.5 -top-1.5" />
            </span>
          </div>

          <PadGrid deckId={deckId} hotCues={deck.hotCues} />
        </div>

        {/* right: platter + vinyl, tempo beside them ------------------- */}
        {/* Side by side, not stacked. Stacking is what forced the platter down
            to 54px: the column had to hold both. Beside each other, the platter
            gets the column's full 178px height and the layout does not grow. */}
        <div className="flex shrink-0 items-start gap-2">
          {/* Vinyl keeps its natural width rather than filling the platter:
              stretched to 142px it became the largest coloured area on the deck
              — louder than PLAY — and it is on by default, so it would be lit
              almost always. Moving the control is the change here; its weight
              stays what it was. */}
          <div className="flex flex-col items-center gap-1">
            <span className="relative inline-block">
              <Platter
                deckId={deckId}
                positionSec={deck.positionSec}
                durationSec={deck.durationSec}
                playing={deck.playing}
                scratching={deck.scratching}
                hasTrack={!!deck.track}
                color={color}
                size={PLATTER_SIZE}
              />
              <HintIcon id="deck.platter" className="absolute -bottom-1 -right-1" />
            </span>
            <span className="relative inline-flex">
              <Button
                variant="toggle"
                active={deck.vinylMode}
                tone={color}
                onClick={() => ctl.toggleVinylMode(deckId)}
                title="Vinyl mode: stop and start spin down and up instead of cutting"
              >
                Vinyl
              </Button>
              <HintIcon id="deck.vinyl" className="absolute -right-1.5 -top-1.5" />
            </span>
          </div>
          <Fader
            label="Tempo"
            value={deck.tempo}
            min={-1}
            max={1}
            onChange={(v) => ctl.setTempo(deckId, v)}
            color={color}
            length={160}
            detent
            hint="deck.tempo"
            format={(v) =>
              `${v * tempoRange * 100 > 0 ? '+' : ''}${(v * tempoRange * 100).toFixed(1)}%`
            }
          />
        </div>
      </div>
    </section>
  )
}
