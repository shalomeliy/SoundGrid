import { useEffect, useState } from 'react'
import { engine } from '@/platform/audio-webaudio/engine'
import { initAudio, toggleQuantize } from '@/controls'
import { midi } from '@/platform/transport-webmidi/manager'
import { settings } from '@/platform/settings-idb/store'
import { useStore } from '@/app/state/store'
import { Button, HintIcon, Pill, type PillTone } from '@/app/components/controls'

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const audioReady = useStore((s) => s.audioReady)
  const quantize = useStore((s) => s.quantize)
  const output = useStore((s) => s.output)
  const midiState = useStore((s) => s.midi)
  const scratchReady = useStore((s) => s.scratchReady)
  const scratchError = useStore((s) => s.scratchError)
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

    // A remembered device that is never re-applied is a setting that pretends
    // to work. Applied when the card is still here; named when it is not,
    // because "the mix is coming out of the laptop speakers" is exactly the
    // kind of silent fallback this project treats as a bug.
    const wanted = settings.values.outputDeviceId
    if (wanted) {
      if (outs.some((d) => d.deviceId === wanted)) {
        const res = await engine.setOutputDevice(wanted)
        if (res === 'ok') setOutput({ currentId: wanted, multichannel: engine.isMultichannel })
      } else {
        useStore.getState().setNotice({
          text: 'The audio device you last used is not connected — using the system default.',
          tone: 'warn',
          source: 'output',
        })
      }
    }
    setBusy(false)
  }

  async function pickOutput(deviceId: string) {
    setBusy(true)
    const res = await engine.setOutputDevice(deviceId)
    if (res === 'ok') {
      setOutput({ currentId: deviceId, multichannel: engine.isMultichannel })
      // Remembered from v0.2.5 on. Device ids are stable per browser profile,
      // so this survives a reload; a card that is gone next time simply is not
      // in the list, and the app stays on the system default.
      void settings.set('outputDeviceId', deviceId || null)
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
          <HintIcon id="topbar.startEngine" className="absolute -right-1.5 -top-1.5" />
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
            <span className="relative h-0 w-0">
              <HintIcon id="topbar.output" className="absolute left-1 top-1/2 -translate-y-1/2" />
            </span>
          </label>
          <Pill
            tone={output.multichannel ? 'live' : 'warn'}
            label={output.multichannel ? '4-ch · master + cue split' : 'stereo · cue folded in'}
          />
          {/* Silence here would be the bug. Without the worklet the decks still
              play, but the read pointer cannot reverse or hold, so scratching
              is gone — and a jog that quietly turns into a seek looks like a
              working feature that just feels wrong. Name it, and say why. */}
          {!scratchReady && (
            <Pill tone="warn" label={`no scratch · ${scratchError ?? 'AudioWorklet unavailable'}`} />
          )}
          {/* Off by default (v0.3.0 decision) — CUE/hot cues/loops stay exactly
              as precise as before until the user opts in. */}
          <Button variant="toggle" active={quantize} tone="var(--color-accent)" onClick={toggleQuantize}>
            Quantize
            <HintIcon id="topbar.quantize" className="absolute -right-1.5 -top-1.5" />
          </Button>
        </>
      )}

      <div className="ml-auto flex items-center gap-3">
        <MidiBadge />
        {midiState.lastMessage && (
          <span className="tnum hidden max-w-[14rem] truncate text-2xs text-grid-dim sm:inline">
            {midiState.lastMessage}
          </span>
        )}
        {/* Deliberately next to the raw MIDI line: together they answer "did it
            arrive" and "what did it do", which is the pair you need when a
            control appears dead. */}
        {midiState.lastJog && (
          <span
            className={`tnum hidden max-w-[16rem] truncate text-2xs sm:inline ${
              midiState.lastJog.includes('ignored') ? 'text-warn' : 'text-live'
            }`}
          >
            {midiState.lastJog}
          </span>
        )}
        {midiState.status === 'idle' && audioReady && (
          <Button variant="ghost" size="sm" onClick={() => midi.init()}>
            Connect MIDI
            <HintIcon id="topbar.connectMidi" className="absolute -right-1.5 -top-1.5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onOpenSettings}>
          Settings
          <HintIcon id="topbar.settings" className="absolute -right-1.5 -top-1.5" />
        </Button>
      </div>
    </header>
  )
}

function MidiBadge() {
  const { status, devices } = useStore((s) => s.midi)
  const map: Record<string, [PillTone, string]> = {
    unsupported: ['danger', 'MIDI unsupported'],
    idle: ['idle', 'MIDI idle'],
    requesting: ['warn', 'MIDI connecting…'],
    denied: ['danger', 'MIDI denied'],
    ready: ['live', devices.length ? devices[0].name : 'MIDI ready · no device'],
  }
  const [tone, label] = map[status] ?? map.idle
  return <Pill tone={tone} label={label} />
}
