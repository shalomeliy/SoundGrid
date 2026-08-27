import * as ctl from '../controls'
import { TEMPO_RANGE } from '../audio/constants'
import { useStore } from '../state/store'
import type { DeckId } from '../types'
import { Fader } from './controls'
import { PadGrid } from './PadGrid'
import { Waveform } from './Waveform'

const DECK_COLOR: Record<DeckId, string> = { A: '#29c5ff', B: '#ff8f29' }

function fmt(sec: number): string {
  if (!isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Deck({ deckId }: { deckId: DeckId }) {
  const deck = useStore((s) => s.decks[deckId])
  const color = DECK_COLOR[deckId]
  const effectiveBpm =
    deck.bpm != null ? deck.bpm * (1 + deck.tempo * TEMPO_RANGE) : null

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-grid-border bg-grid-panel p-3"
      style={{ borderTopColor: color, borderTopWidth: 2 }}
    >
      <header className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-xs font-bold text-black"
            style={{ background: color }}
          >
            {deckId}
          </span>
          <span className="max-w-[16rem] truncate text-sm font-medium">
            {deck.loading ? 'Loading…' : (deck.track?.name ?? 'No track loaded')}
          </span>
        </div>
        <div className="font-mono text-xs text-grid-muted">
          {fmt(deck.positionSec)} / {fmt(deck.durationSec)}
        </div>
      </header>

      <Waveform
        deckId={deckId}
        peaks={deck.peaks}
        positionSec={deck.positionSec}
        durationSec={deck.durationSec}
        bpm={deck.bpm}
        hotCues={deck.hotCues}
        color={color}
        onSeek={(s) => ctl.seekDeck(deckId, s)}
      />

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex gap-2">
            <button
              onMouseDown={() => {
                const release = ctl.cuePlayPreview(deckId)
                const up = () => {
                  release()
                  window.removeEventListener('mouseup', up)
                }
                if (!deck.playing) window.addEventListener('mouseup', up)
                else ctl.cue(deckId)
              }}
              className="flex-1 rounded bg-grid-panel-2 py-2 text-sm font-semibold hover:bg-grid-border"
            >
              CUE
            </button>
            <button
              onClick={() => ctl.togglePlay(deckId)}
              className="flex-1 rounded py-2 text-sm font-bold text-black"
              style={{ background: deck.playing ? color : '#4b5563' }}
            >
              {deck.playing ? 'PAUSE' : 'PLAY'}
            </button>
            <button
              onClick={() => ctl.syncDeck(deckId)}
              className="rounded bg-grid-panel-2 px-3 py-2 text-sm font-semibold hover:bg-grid-border"
            >
              SYNC
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => ctl.toggleLoop(deckId)}
              className="rounded px-2 py-1 text-xs font-semibold"
              style={{
                background: deck.loopActive ? color : 'var(--color-grid-panel-2)',
                color: deck.loopActive ? '#000' : 'inherit',
              }}
            >
              LOOP
            </button>
            <button
              onClick={() => ctl.setLoopBeats(deckId, deck.loopBeats / 2)}
              className="rounded bg-grid-panel-2 px-2 py-1 text-xs"
            >
              ÷2
            </button>
            <span className="w-10 text-center font-mono text-xs">{deck.loopBeats}b</span>
            <button
              onClick={() => ctl.setLoopBeats(deckId, deck.loopBeats * 2)}
              className="rounded bg-grid-panel-2 px-2 py-1 text-xs"
            >
              ×2
            </button>
            <button
              onClick={() => ctl.toggleCueMonitor(deckId)}
              className="ml-auto rounded px-2 py-1 text-xs font-semibold"
              style={{
                background: deck.cueMonitor ? '#3bff88' : 'var(--color-grid-panel-2)',
                color: deck.cueMonitor ? '#000' : 'inherit',
              }}
            >
              PFL
            </button>
          </div>

          <PadGrid deckId={deckId} hotCues={deck.hotCues} />
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="font-mono text-sm font-bold" style={{ color }}>
            {effectiveBpm ? effectiveBpm.toFixed(1) : '—'}
          </div>
          <div className="text-[10px] text-grid-muted">BPM</div>
          <Fader
            value={deck.tempo}
            min={-1}
            max={1}
            onChange={(v) => ctl.setTempo(deckId, v)}
            color={color}
            length={150}
          />
          <div className="font-mono text-[10px] text-grid-muted">
            {(deck.tempo * TEMPO_RANGE * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </section>
  )
}
