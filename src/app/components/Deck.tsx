import { useState } from 'react'
import * as ctl from '@/controls'
import { TEMPO_RANGE } from '@/core/constants'
import { useStore } from '@/app/state/store'
import type { DeckId } from '@/core/types'
import { Button, Fader } from '@/app/components/controls'
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
  const effectiveBpm =
    deck.bpm != null ? deck.bpm * (1 + deck.tempo * TEMPO_RANGE) : null
  const deltaPct = deck.tempo * TEMPO_RANGE * 100
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
            {effectiveBpm ? effectiveBpm.toFixed(1) : '—'}
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
        </div>
      </header>

      <Waveform
        deckId={deckId}
        peaks={deck.peaks}
        bands={deck.bands}
        positionSec={deck.positionSec}
        durationSec={deck.durationSec}
        bpm={deck.bpm}
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
              variant="toggle"
              active={deck.cueMonitor}
              tone="var(--color-live)"
              className="ml-auto"
              onClick={() => ctl.toggleCueMonitor(deckId)}
            >
              PFL
            </Button>
          </div>

          <PadGrid deckId={deckId} hotCues={deck.hotCues} />
        </div>

        {/* right: platter + tempo ------------------------------------- */}
        <div className="flex w-[76px] shrink-0 flex-col items-center gap-2">
          <Platter
            positionSec={deck.positionSec}
            durationSec={deck.durationSec}
            playing={deck.playing}
            color={color}
            size={54}
          />
          <Fader
            label="Tempo"
            value={deck.tempo}
            min={-1}
            max={1}
            onChange={(v) => ctl.setTempo(deckId, v)}
            color={color}
            length={92}
            detent
            format={(v) =>
              `${v * TEMPO_RANGE * 100 > 0 ? '+' : ''}${(v * TEMPO_RANGE * 100).toFixed(1)}%`
            }
          />
        </div>
      </div>
    </section>
  )
}
