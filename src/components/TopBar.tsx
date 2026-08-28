import { useEffect, useState } from 'react'
import { engine } from '../audio/engine'
import { initAudio } from '../controls'
import { midi } from '../midi/manager'
import { useStore } from '../state/store'
import { Button } from './controls'

export function TopBar() {
  const audioReady = useStore((s) => s.audioReady)
  const output = useStore((s) => s.output)
  const midiState = useStore((s) => s.midi)
  const setOutput = useStore((s) => s.setOutput)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setOutput({ sinkSupported: typeof engine.ctx.setSinkId === 'function' })
  }, [setOutput])

  async function start() {
    setBusy(true)
    await initAudio()
    const outs = await engine.listOutputs()
    setOutput({
      devices: outs.map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Output ${d.deviceId.slice(0, 6)}`,
      })),
      multichannel: engine.isMultichannel,
    })
    await midi.init()
    setBusy(false)
  }

  async function pickOutput(deviceId: string) {
    setBusy(true)
    const res = await engine.setOutputDevice(deviceId)
    if (res === 'ok') {
      setOutput({ currentId: deviceId, multichannel: engine.isMultichannel })
    } else if (res === 'unsupported') {
      alert(
        'This browser cannot route audio to a specific device (setSinkId). ' +
          'Set the DDJ-FLX4 as your system default output instead.',
      )
    }
    setBusy(false)
  }

  return (
    <header className="flex items-center gap-4 border-b border-hairline bg-surface-1 px-4 py-2.5">
      <h1 className="text-sm font-bold tracking-tight">
        Sound<span className="text-accent">Grid</span>
      </h1>

      {!audioReady ? (
        <Button variant="toggle" active tone="var(--color-accent)" onClick={start} disabled={busy}>
          {busy ? 'Starting…' : 'Start audio engine'}
        </Button>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs text-grid-muted">
            <span className="label">Out</span>
            <select
              value={output.currentId ?? ''}
              onChange={(e) => pickOutput(e.target.value)}
              disabled={!output.sinkSupported || busy}
              className="rounded-[var(--radius-sm)] border border-hairline bg-surface-2 px-2 py-1 text-xs text-grid-text outline-none transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50"
            >
              <option value="">System default</option>
              {output.devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <Pill
            tone={output.multichannel ? 'live' : 'warn'}
            label={output.multichannel ? '4-ch · master + cue split' : 'stereo · cue folded in'}
          />
        </>
      )}

      <div className="ml-auto flex items-center gap-3">
        <MidiBadge />
        {midiState.lastMessage && (
          <span className="tnum hidden max-w-[14rem] truncate text-2xs text-grid-dim sm:inline">
            {midiState.lastMessage}
          </span>
        )}
        {midiState.status === 'idle' && audioReady && (
          <Button variant="ghost" size="sm" onClick={() => midi.init()}>
            Connect MIDI
          </Button>
        )}
      </div>
    </header>
  )
}

const TONES: Record<string, string> = {
  live: 'var(--color-live)',
  warn: 'var(--color-warn)',
  danger: 'var(--color-danger)',
  idle: 'var(--color-grid-dim)',
}

function Pill({ tone, label }: { tone: keyof typeof TONES; label: string }) {
  const c = TONES[tone]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-semibold"
      style={{ background: `color-mix(in srgb, ${c}, transparent 86%)`, color: c }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  )
}

function MidiBadge() {
  const { status, devices } = useStore((s) => s.midi)
  const map: Record<string, [keyof typeof TONES, string]> = {
    unsupported: ['danger', 'MIDI unsupported'],
    idle: ['idle', 'MIDI idle'],
    requesting: ['warn', 'MIDI connecting…'],
    denied: ['danger', 'MIDI denied'],
    ready: ['live', devices.length ? devices[0].name : 'MIDI ready · no device'],
  }
  const [tone, label] = map[status] ?? map.idle
  return <Pill tone={tone} label={label} />
}
