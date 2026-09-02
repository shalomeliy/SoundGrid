import { useState } from 'react'
import * as ctl from '@/controls'
import { PLATTER_SIZE } from '@/core/constants'
import { useSettings } from '@/app/hooks/useSettings'
import { useStore } from '@/app/state/store'
import type { DeckId } from '@/core/types'
import { Button, Fader, Pill } from '@/app/components/controls'
import { PadGrid } from '@/app/components/PadGrid'
import { Platter } from '@/app/components/Platter'
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
  const color = DECK_COLOR[deckId]
  const loaded = !!deck.track
  const [dropActive, setDropActive] = useState(false)

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
        <div className="min-w-0 flex-1">
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
        </div>
        <div className="shrink-0 text-right">
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
          {/* A grid detection wasn't confident about, or found nothing at all,
              is shown — never silently trusted (CLAUDE.md's central rule).
              Cleared once the user checks or edits it (BeatGridPanel). */}
          {loaded && !deck.beatGridConfirmed && (
            <div className="mt-1 flex justify-end">
              <Pill tone="warn" label="unconfirmed grid" />
            </div>
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
          <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2">
            <Button
              variant="transport"
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
            <Button
              variant="transport"
              active={deck.playing}
              tone={color}
              onClick={() => ctl.togglePlay(deckId)}
              disabled={!loaded}
            >
              {deck.playing ? 'Pause' : 'Play'}
            </Button>
            <Button variant="transport" onClick={() => ctl.syncDeck(deckId)} disabled={!loaded}>
              Sync
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="toggle"
              active={deck.loopActive}
              tone={color}
              onClick={() => ctl.toggleLoop(deckId)}
              disabled={!loaded}
            >
              Loop
            </Button>
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
            <Button
              className="ml-auto"
              variant="toggle"
              active={deck.cueMonitor}
              tone="var(--color-live)"
              onClick={() => ctl.toggleCueMonitor(deckId)}
            >
              PFL
            </Button>
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
            <Button
              variant="toggle"
              active={deck.vinylMode}
              tone={color}
              onClick={() => ctl.toggleVinylMode(deckId)}
              title="Vinyl mode: stop and start spin down and up instead of cutting"
            >
              Vinyl
            </Button>
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
            format={(v) =>
              `${v * tempoRange * 100 > 0 ? '+' : ''}${(v * tempoRange * 100).toFixed(1)}%`
            }
          />
        </div>
      </div>
    </section>
  )
}
