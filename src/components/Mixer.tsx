import * as ctl from '../controls'
import { useStore } from '../state/store'
import type { DeckId } from '../types'
import { Fader, Knob } from './controls'

const DECK_COLOR: Record<DeckId, string> = { A: 'var(--color-deck-a)', B: 'var(--color-deck-b)' }

function ChannelStrip({ deckId }: { deckId: DeckId }) {
  const ch = useStore((s) => s.mixer.channels[deckId])
  const color = DECK_COLOR[deckId]
  return (
    <div className="flex flex-col items-center gap-2.5">
      <span
        className="grid h-5 w-5 place-items-center rounded-[var(--radius-xs)] text-2xs font-bold text-black"
        style={{ background: color }}
      >
        {deckId}
      </span>
      <div className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] bg-surface-0/60 p-2 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
        <Knob label="Hi" value={ch.eqHigh} tone={color} onChange={(v) => ctl.setEq(deckId, 'high', v)} />
        <Knob label="Mid" value={ch.eqMid} tone={color} onChange={(v) => ctl.setEq(deckId, 'mid', v)} />
        <Knob label="Low" value={ch.eqLow} tone={color} onChange={(v) => ctl.setEq(deckId, 'low', v)} />
      </div>
      <Knob label="Filter" value={ch.filter} tone="var(--color-accent)" onChange={(v) => ctl.setFilter(deckId, v)} />
      <Fader
        label="Vol"
        value={ch.volume}
        onChange={(v) => ctl.setChannelVolume(deckId, v)}
        color={color}
        length={128}
        format={(v) => `${Math.round(v * 100)}`}
      />
    </div>
  )
}

export function Mixer() {
  const mixer = useStore((s) => s.mixer)
  return (
    <section className="panel flex flex-col items-center gap-3 p-3">
      <span className="label self-start">Mix</span>
      <div className="flex flex-1 gap-3">
        <ChannelStrip deckId="A" />
        <div className="flex flex-col items-center gap-3 pt-7">
          <Knob
            label="Master"
            value={mixer.masterVolume}
            min={0}
            max={1}
            tone="var(--color-grid-text)"
            onChange={ctl.setMasterVolume}
            format={(v) => `${Math.round(v * 100)}`}
          />
          <div className="h-px w-8 bg-hairline" />
          <Knob label="Cue Vol" value={mixer.cueVolume} min={0} max={1} tone="var(--color-live)" onChange={ctl.setCueVolume} />
          <Knob label="Cue Mix" value={mixer.cueMix} min={0} max={1} tone="var(--color-live)" onChange={ctl.setCueMix} />
        </div>
        <ChannelStrip deckId="B" />
      </div>

      <div className="flex w-full flex-col items-center gap-1.5 pt-1">
        <Fader
          value={mixer.crossfader}
          min={-1}
          max={1}
          vertical={false}
          onChange={ctl.setCrossfader}
          length={196}
          detent
        />
        <div className="flex w-[196px] justify-between">
          <span className="text-2xs font-bold" style={{ color: DECK_COLOR.A }}>
            A
          </span>
          <span className="label">Crossfader</span>
          <span className="text-2xs font-bold" style={{ color: DECK_COLOR.B }}>
            B
          </span>
        </div>
      </div>
    </section>
  )
}
