import * as ctl from '@/controls'
import { useStore } from '@/app/state/store'
import type { DeckId } from '@/core/types'
import { Fader, Knob } from '@/app/components/controls'

const DECK_COLOR: Record<DeckId, string> = { A: 'var(--color-deck-a)', B: 'var(--color-deck-b)' }

function ChannelStrip({ deckId }: { deckId: DeckId }) {
  const ch = useStore((s) => s.mixer.channels[deckId])
  const color = DECK_COLOR[deckId]
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className="grid h-4 w-4 place-items-center rounded-[var(--radius-xs)] text-[9px] font-bold text-black"
        style={{ background: color }}
      >
        {deckId}
      </span>
      {/* EQ + filter in a recessed well, laid out horizontally to keep the
          mixer short enough that the library still gets real estate */}
      <div className="flex items-start gap-1 rounded-[var(--radius-md)] bg-surface-0/60 px-2 py-1.5 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
        <Knob label="Hi" size={30} value={ch.eqHigh} tone={color} onChange={(v) => ctl.setEq(deckId, 'high', v)} />
        <Knob label="Mid" size={30} value={ch.eqMid} tone={color} onChange={(v) => ctl.setEq(deckId, 'mid', v)} />
        <Knob label="Low" size={30} value={ch.eqLow} tone={color} onChange={(v) => ctl.setEq(deckId, 'low', v)} />
        <div className="mx-0.5 h-9 w-px self-center bg-hairline" />
        <Knob label="Filter" size={30} value={ch.filter} tone="var(--color-accent)" onChange={(v) => ctl.setFilter(deckId, v)} />
      </div>
      <Fader
        label="Vol"
        value={ch.volume}
        onChange={(v) => ctl.setChannelVolume(deckId, v)}
        color={color}
        length={92}
        format={(v) => `${Math.round(v * 100)}`}
      />
    </div>
  )
}

export function Mixer() {
  const mixer = useStore((s) => s.mixer)
  return (
    <section className="panel flex flex-col items-center gap-2.5 overflow-hidden p-2.5">
      <span className="label self-start">Mix</span>

      <div className="flex items-start gap-4">
        <ChannelStrip deckId="A" />
        <ChannelStrip deckId="B" />
      </div>

      <div className="flex items-center gap-4 pt-0.5">
        <Knob
          label="Master"
          size={32}
          value={mixer.masterVolume}
          min={0}
          max={1}
          tone="var(--color-grid-text)"
          onChange={ctl.setMasterVolume}
          format={(v) => `${Math.round(v * 100)}`}
        />
        <Knob label="Cue Vol" size={32} value={mixer.cueVolume} min={0} max={1} tone="var(--color-live)" onChange={ctl.setCueVolume} />
        <Knob label="Cue Mix" size={32} value={mixer.cueMix} min={0} max={1} tone="var(--color-live)" onChange={ctl.setCueMix} />
      </div>

      <div className="mt-auto flex w-full flex-col items-center gap-1.5 pt-2">
        <Fader
          value={mixer.crossfader}
          min={-1}
          max={1}
          vertical={false}
          onChange={ctl.setCrossfader}
          length={188}
          detent
        />
        <div className="flex w-[188px] justify-between">
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
