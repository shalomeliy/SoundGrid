import * as ctl from '../controls'
import { useStore } from '../state/store'
import type { DeckId } from '../types'
import { Fader, Knob } from './controls'

const DECK_COLOR: Record<DeckId, string> = { A: '#29c5ff', B: '#ff8f29' }

function ChannelStrip({ deckId }: { deckId: DeckId }) {
  const ch = useStore((s) => s.mixer.channels[deckId])
  const color = DECK_COLOR[deckId]
  return (
    <div className="flex flex-col items-center gap-2">
      <Knob label="Hi" value={ch.eqHigh} onChange={(v) => ctl.setEq(deckId, 'high', v)} />
      <Knob label="Mid" value={ch.eqMid} onChange={(v) => ctl.setEq(deckId, 'mid', v)} />
      <Knob label="Low" value={ch.eqLow} onChange={(v) => ctl.setEq(deckId, 'low', v)} />
      <Knob label="FX" value={ch.filter} onChange={(v) => ctl.setFilter(deckId, v)} />
      <Fader
        value={ch.volume}
        onChange={(v) => ctl.setChannelVolume(deckId, v)}
        color={color}
        length={130}
      />
      <span className="text-xs font-bold" style={{ color }}>
        {deckId}
      </span>
    </div>
  )
}

export function Mixer() {
  const mixer = useStore((s) => s.mixer)
  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-grid-border bg-grid-panel p-3">
      <div className="flex gap-4">
        <ChannelStrip deckId="A" />
        <div className="flex flex-col items-center gap-2">
          <Knob
            label="Master"
            value={mixer.masterVolume}
            min={0}
            max={1}
            onChange={ctl.setMasterVolume}
          />
          <Knob
            label="Cue Vol"
            value={mixer.cueVolume}
            min={0}
            max={1}
            onChange={ctl.setCueVolume}
          />
          <Knob
            label="Cue Mix"
            value={mixer.cueMix}
            min={0}
            max={1}
            onChange={ctl.setCueMix}
          />
        </div>
        <ChannelStrip deckId="B" />
      </div>

      <div className="flex w-full flex-col items-center gap-1">
        <Fader
          value={mixer.crossfader}
          min={-1}
          max={1}
          vertical={false}
          onChange={ctl.setCrossfader}
          length={200}
        />
        <div className="flex w-[200px] justify-between text-[10px] text-grid-muted">
          <span>A</span>
          <span>CROSSFADER</span>
          <span>B</span>
        </div>
      </div>
    </section>
  )
}
