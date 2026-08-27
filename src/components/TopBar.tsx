import { useEffect, useState } from 'react'
import { engine } from '../audio/engine'
import { initAudio } from '../controls'
import { midi } from '../midi/manager'
import { useStore } from '../state/store'

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
    <header className="flex items-center gap-3 border-b border-grid-border bg-grid-panel px-4 py-2">
      <h1 className="text-sm font-bold tracking-tight">
        Sound<span className="text-accent">Grid</span>
      </h1>

      {!audioReady ? (
        <button
          onClick={start}
          disabled={busy}
          className="rounded bg-accent px-3 py-1 text-xs font-semibold text-black"
        >
          {busy ? 'Starting…' : 'Start audio engine'}
        </button>
      ) : (
        <>
          <label className="flex items-center gap-1 text-xs text-grid-muted">
            Output
            <select
              value={output.currentId ?? ''}
              onChange={(e) => pickOutput(e.target.value)}
              disabled={!output.sinkSupported || busy}
              className="rounded border border-grid-border bg-grid-bg px-1.5 py-1 text-xs text-grid-text"
            >
              <option value="">System default</option>
              {output.devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              output.multichannel
                ? 'bg-green-500/20 text-green-400'
                : 'bg-yellow-500/20 text-yellow-400'
            }`}
          >
            {output.multichannel ? '4-ch: master + cue split' : 'stereo: cue folded in'}
          </span>
        </>
      )}

      <div className="ml-auto flex items-center gap-2 text-xs">
        <MidiBadge />
        <span className="max-w-[16rem] truncate font-mono text-[10px] text-grid-muted">
          {midiState.lastMessage ?? 'no MIDI yet'}
        </span>
        {midiState.status === 'idle' && audioReady && (
          <button
            onClick={() => midi.init()}
            className="rounded bg-grid-panel-2 px-2 py-1 text-xs"
          >
            Connect MIDI
          </button>
        )}
      </div>
    </header>
  )
}

function MidiBadge() {
  const { status, devices } = useStore((s) => s.midi)
  const map: Record<string, [string, string]> = {
    unsupported: ['bg-red-500/20 text-red-400', 'MIDI unsupported'],
    idle: ['bg-grid-panel-2 text-grid-muted', 'MIDI idle'],
    requesting: ['bg-yellow-500/20 text-yellow-400', 'MIDI…'],
    denied: ['bg-red-500/20 text-red-400', 'MIDI denied'],
    ready: [
      'bg-green-500/20 text-green-400',
      devices.length ? `MIDI: ${devices[0].name}` : 'MIDI ready (no device)',
    ],
  }
  const [cls, label] = map[status] ?? map.idle
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>
}
