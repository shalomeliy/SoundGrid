import { useEffect, useRef, useState } from 'react'
import * as ctl from '@/controls'
import { DEFAULTS, FIELDS, type Field, type FieldGroup, type Settings } from '@/core/settings'
import { settings } from '@/platform/settings-idb/store'
import { useSettings } from '@/app/hooks/useSettings'
import { useStore } from '@/app/state/store'
import { Button } from '@/app/components/controls'

/**
 * The Settings screen.
 *
 * **Generated from `FIELDS`, not hand-written.** Which controls exist is a
 * decision recorded once in `core/settings.ts`; a screen that listed them again
 * could grow a control the schema never sanctioned — including one for a
 * calibration constant that exists to pin a fixed bug, which is exactly what
 * v0.2.5's own scope forbids.
 *
 * Laid out for ~710 CSS px of viewport height: a fixed header and a single
 * scrolling column, so nothing important can end up below the fold on the
 * owner's screen.
 */

const GROUPS: { id: FieldGroup | 'system'; label: string; blurb: string }[] = [
  { id: 'hardware', label: 'Controller', blurb: 'Your FLX4, and how hard it pushes.' },
  { id: 'feel', label: 'Feel', blurb: 'How the decks respond to a hand.' },
  { id: 'display', label: 'Display', blurb: 'What is drawn, and how often.' },
  { id: 'library', label: 'Library', blurb: 'The track list and how keys are named.' },
  { id: 'system', label: 'System', blurb: 'What this machine supports, and what SoundGrid does with it.' },
]

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const values = useSettings()
  const [group, setGroup] = useState<FieldGroup | 'system'>('hardware')

  // Esc closes. A full-screen panel with no keyboard way out is a trap, and the
  // decks keep playing behind it — this must never be the thing between the DJ
  // and the crossfader.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-surface-0/97 backdrop-blur-sm">
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-2.5">
        <h2 className="text-sm font-bold tracking-tight">Settings</h2>
        <nav className="flex items-center gap-1">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              onClick={() => setGroup(g.id)}
              className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs transition-colors ${
                group === g.id
                  ? 'bg-surface-3 text-grid-text'
                  : 'text-grid-muted hover:bg-surface-2 hover:text-grid-text'
              }`}
            >
              {g.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-2xs text-grid-dim">Esc to close</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </header>

      <StorageReport />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-3 text-2xs text-grid-dim">
          {GROUPS.find((g) => g.id === group)?.blurb}
        </p>

        {group === 'system' ? (
          <SystemPanel />
        ) : (
          <div className="flex flex-col gap-3">
            {group === 'hardware' && <JogMeasure />}
            {FIELDS.filter((f) => f.group === group).map((f) => (
              <FieldRow key={f.key} field={f} values={values} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * What the stored settings could not give us, and what is being used instead.
 *
 * The project's central rule applied to the settings file itself: a value that
 * was repaired on the way in is a thing the user has to be able to find out.
 * Silence here would mean tuning a number the app quietly replaced.
 */
function StorageReport() {
  const { issues, migrated } = settings
  if (issues.length === 0 && migrated.length === 0) return null
  return (
    <div className="shrink-0 border-b border-hairline bg-warn/10 px-4 py-2 text-2xs">
      {migrated.length > 0 && (
        <p className="text-grid-muted">
          Carried over from an earlier version: <b>{migrated.join(', ')}</b>
        </p>
      )}
      {issues.map((i) => (
        <p key={i.key + i.got} className="text-warn">
          <b>{i.key}</b> — stored {i.got}, using {i.used} ({i.reason.replace(/-/g, ' ')})
        </p>
      ))}
    </div>
  )
}

function FieldRow({ field, values }: { field: Field; values: Settings }) {
  const value = values[field.key]
  const isDefault = value === DEFAULTS[field.key]

  return (
    <div className="rounded-[var(--radius-sm)] border border-hairline bg-surface-1 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-grid-text">{field.label}</div>
          <div className="text-2xs text-grid-dim">{field.help}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Control field={field} value={value} />
          {/* A value the user broke has to be reversible in one click, or the
              screen is a place to get stuck rather than a place to tune. */}
          <button
            onClick={() => void settings.reset(field.key)}
            disabled={isDefault}
            title={`Default: ${String(DEFAULTS[field.key])}`}
            className="rounded-[var(--radius-xs)] px-1.5 py-0.5 text-2xs text-grid-muted transition-colors hover:bg-surface-3 hover:text-grid-text disabled:opacity-30"
          >
            Reset
          </button>
        </div>
      </div>
      {field.requiresReload && (
        <p className="mt-1.5 text-2xs text-warn">
          Takes effect after a reload — the audio engine fixes this when it starts.
        </p>
      )}
      {field.pending && <p className="mt-1.5 text-2xs text-warn">{field.pending}</p>}
    </div>
  )
}

function Control({ field, value }: { field: Field; value: Settings[keyof Settings] }) {
  if (field.kind === 'toggle') {
    return (
      <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-grid-muted">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => void settings.set(field.key, e.target.checked as never)}
          className="h-3.5 w-3.5 accent-[var(--color-accent)]"
        />
        {value === true ? 'On' : 'Off'}
      </label>
    )
  }

  if (field.kind === 'choice') {
    return (
      <select
        value={String(value)}
        onChange={(e) => {
          const picked = field.options.find((o) => String(o.value) === e.target.value)
          if (picked) void settings.set(field.key, picked.value as never)
        }}
        className="rounded-[var(--radius-sm)] border border-hairline bg-surface-2 px-2 py-1 text-xs text-grid-text outline-none transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        {field.options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }

  const scale = field.displayScale ?? 1
  const shown = (value as number) * scale
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value as number}
        onChange={(e) => void settings.set(field.key, Number(e.target.value) as never)}
        className="w-36 accent-[var(--color-accent)]"
      />
      <span className="tnum w-16 text-right text-xs text-grid-text">
        {Number.isInteger(shown) ? shown : shown.toFixed(2)}
        {field.unit ? <span className="text-grid-dim">{field.unit}</span> : null}
      </span>
    </div>
  )
}

/**
 * Measure `jogTicksPerRev` against the wheel itself.
 *
 * This is the button the whole version was reordered for: the constant is a
 * property of the controller, it differs between models, and the only way to
 * get it right is to count the ticks the hardware actually sends in one turn.
 */
function JogMeasure() {
  const midiStatus = useStore((s) => s.midi.status)
  const [deckId, setDeckId] = useState<'A' | 'B'>('A')
  const [ticks, setTicks] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const stopRef = useRef<(() => number) | null>(null)

  // A measurement left running would keep swallowing jog ticks after the screen
  // closed, and the wheel would look dead with nothing on screen to explain it.
  useEffect(
    () => () => {
      stopRef.current?.()
      stopRef.current = null
    },
    [],
  )

  const ready = midiStatus === 'ready'

  function start() {
    setTicks(0)
    stopRef.current = ctl.beginJogMeasure(deckId, setTicks)
    setRunning(true)
  }

  function finish() {
    const total = stopRef.current?.() ?? 0
    stopRef.current = null
    setRunning(false)
    setTicks(total)
    // A turn that produced nothing saves nothing: writing 0 would put the jog
    // resolution at the bottom of its range and make every scratch useless,
    // from a button press that looked successful.
    if (total > 0) void settings.set('jogTicksPerRev', Math.round(total))
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-hairline bg-surface-1 px-3 py-2.5">
      <div className="text-xs font-semibold text-grid-text">Measure the jog wheel</div>
      <div className="text-2xs text-grid-dim">
        Press Start, turn the wheel exactly one full revolution back to where it began, then
        press Done. The wheel will not move the deck while measuring.
      </div>

      {/* No MIDI, no measurement — and the button says which, rather than
          appearing to work and counting to zero. */}
      {!ready ? (
        <p className="mt-2 text-2xs text-warn">
          Connect the controller first — MIDI is {midiStatus}. Nothing to count until then.
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <select
            value={deckId}
            onChange={(e) => setDeckId(e.target.value as 'A' | 'B')}
            disabled={running}
            className="rounded-[var(--radius-sm)] border border-hairline bg-surface-2 px-2 py-1 text-xs text-grid-text disabled:opacity-50"
          >
            <option value="A">Deck A wheel</option>
            <option value="B">Deck B wheel</option>
          </select>
          {running ? (
            <Button variant="toggle" active tone="var(--color-accent)" size="sm" onClick={finish}>
              Done — save {ticks ?? 0}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={start}>
              Start
            </Button>
          )}
          <span className="tnum text-xs text-grid-muted">
            {ticks == null ? '' : `${ticks} ticks`}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * What this machine supports, what SoundGrid will not do, and the keyboard.
 *
 * The capability list is `Capabilities` made visible in one place. It was
 * already resolved at boot and only partly surfaced, so a missing feature could
 * previously only be discovered by the feature not working.
 */
function SystemPanel() {
  const caps = useStore((s) => s.capabilities)
  const output = useStore((s) => s.output)
  const scratchReady = useStore((s) => s.scratchReady)
  const scratchError = useStore((s) => s.scratchError)

  const rows: [string, boolean, string][] = [
    ['Web MIDI', caps.webmidi, 'The controller. Without it, mouse and keyboard only.'],
    ['File System Access', caps.fsAccess, 'Reading your library folder.'],
    ['AudioWorklet', caps.audioWorklet, 'Scratching. Without it decks still play, but cannot reverse.'],
    ['Per-device output', caps.setSinkId, 'Sending the mix to the controller. Without it, use the system default.'],
    ['WebGPU', caps.webgpu, 'Reserved for on-device stems (v0.20).'],
    ['OffscreenCanvas', caps.offscreenCanvas, 'Reserved for moving the waveform off the main thread (v0.12).'],
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[var(--radius-sm)] border border-hairline bg-surface-1 px-3 py-2.5">
        <div className="mb-1.5 text-xs font-semibold text-grid-text">This machine</div>
        <table className="w-full text-2xs">
          <tbody>
            {rows.map(([name, ok, why]) => (
              <tr key={name} className="border-b border-hairline last:border-0">
                <td className="py-1 pr-2 font-semibold text-grid-text">{name}</td>
                <td className="py-1 pr-2">
                  <span className={ok ? 'text-live' : 'text-warn'}>{ok ? 'yes' : 'no'}</span>
                </td>
                <td className="py-1 text-grid-dim">{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!scratchReady && (
          <p className="mt-1.5 text-2xs text-warn">
            Scratch engine is not running: {scratchError ?? 'AudioWorklet unavailable'}
          </p>
        )}
        <p className="mt-1.5 text-2xs text-grid-dim">
          Audio output: {output.currentId ? output.devices.find((d) => d.deviceId === output.currentId)?.label ?? output.currentId : 'system default'}
          {' · '}
          {output.multichannel ? '4-channel, cue on its own pair' : 'stereo, cue folded in'}
        </p>
      </div>

      <div className="rounded-[var(--radius-sm)] border border-hairline bg-surface-1 px-3 py-2.5">
        <div className="mb-1.5 text-xs font-semibold text-grid-text">Keyboard</div>
        <table className="w-full text-2xs">
          <tbody>
            {[
              ['Q / P', 'Play or pause deck A / B'],
              ['A / ;', 'Cue deck A / B'],
              ['S / D', 'Bend deck A down / up (hold)'],
              ['K / L', 'Bend deck B down / up (hold)'],
              ['↑ / ↓', 'Move through the track list'],
              ['[ / ]', 'Load the selected track to deck A / B'],
            ].map(([keys, what]) => (
              <tr key={keys} className="border-b border-hairline last:border-0">
                <td className="tnum py-1 pr-3 font-semibold text-grid-text">{keys}</td>
                <td className="py-1 text-grid-dim">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-2xs text-grid-dim">
          There is deliberately no scratch key: a scratch is a gesture with a speed, and a key
          has none.
        </p>
      </div>

      {/* Stated, not omitted. Two of the things a DJ tool is most often asked
          about are things SoundGrid does not do, and a settings screen that
          simply lacked the toggles would leave the user guessing. */}
      <div className="rounded-[var(--radius-sm)] border border-hairline bg-surface-1 px-3 py-2.5">
        <div className="mb-1.5 text-xs font-semibold text-grid-text">What SoundGrid does not do</div>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-2xs text-grid-dim">
          <li>
            <b className="text-grid-muted">Never writes to your music files.</b> Tags are read in
            byte ranges; nothing is written back, so there is no “protect library” switch to get
            wrong.
          </li>
          <li>
            <b className="text-grid-muted">No usage data, ever.</b> There is no server and no
            telemetry, so there is nothing to opt out of.
          </li>
          <li>
            <b className="text-grid-muted">No streaming services.</b> SoundGrid plays the files on
            this computer.
          </li>
        </ul>
      </div>
    </div>
  )
}
