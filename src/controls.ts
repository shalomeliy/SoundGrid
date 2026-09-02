import { analyzeWaveform, detectBeatGrid } from '@/platform/analyzer-js/analyze'
import { engine } from '@/platform/audio-webaudio/engine'
import { BEATGRID_NUDGE_SEC, HOT_CUE_COLORS } from '@/core/constants'
import { bpmFromTaps, doubleGrid, halveGrid, setDownbeatAt, shiftGrid } from '@/core/beatgrid'
import { readTrackData } from '@/platform/source-fsaccess/library'
import { settings } from '@/platform/settings-idb/store'
import { DEFAULTS, FIELD_BY_KEY, secPerRev, type Settings } from '@/core/settings'
import { useStore } from '@/app/state/store'
import type { BeatGrid, DeckId, Track } from '@/core/types'

/**
 * The control surface shared by the on-screen UI and the MIDI mapping layer.
 * Every user-facing action goes through here so a knob turn and a mouse drag
 * stay in sync.
 */

/**
 * The user's settings, held in a plain local and refreshed on change.
 *
 * **Not read from the store per call, and that is a performance decision with
 * a scar behind it.** The FLX4 sends ~670 jog messages a second and every one
 * lands in `jogTurn`; the first version of the jog readout did per-message work
 * and could plausibly have starved the render loop that draws the playhead.
 * A subscription costs one assignment per *change* instead of a lookup per
 * *tick*, and the port is documented to be used exactly this way.
 */
let cfg: Settings = DEFAULTS
settings.subscribe((v) => {
  const prev = cfg
  cfg = v
  // Two of these values are baked into an audio node the moment a knob or a
  // fader is moved, so changing them on the screen would otherwise do nothing
  // until the user happened to touch that control again — a setting that
  // appears to apply and does not. Re-apply from the store's current knob
  // positions instead. Only on an actual change: this runs on every write.
  if (v.eqDb !== prev.eqDb || v.tempoRange !== prev.tempoRange) {
    const { decks, mixer } = useStore.getState()
    for (const id of ['A', 'B'] as DeckId[]) {
      const deck = engine.decks[id]
      if (v.eqDb !== prev.eqDb) {
        deck.setEq('low', mixer.channels[id].eqLow)
        deck.setEq('mid', mixer.channels[id].eqMid)
        deck.setEq('high', mixer.channels[id].eqHigh)
      }
      if (v.tempoRange !== prev.tempoRange) deck.setTempo(decks[id].tempo)
    }
  }
})

export async function initAudio() {
  await engine.resume()
  const state = useStore.getState()
  if (!state.audioReady) {
    engine.setMasterVolume(state.mixer.masterVolume)
    engine.setCueVolume(state.mixer.cueVolume)
    engine.setCueMix(state.mixer.cueMix)
    engine.setCrossfader(state.mixer.crossfader)
    ;(['A', 'B'] as DeckId[]).forEach((id) => {
      const ch = state.mixer.channels[id]
      engine.decks[id].setVolume(ch.volume)
    })
    useStore.setState({ audioReady: true })
    syncScratchState()
  }
}

/** Copy the engine's scratch availability into the store for the TopBar pill. */
function syncScratchState() {
  useStore.setState({
    scratchReady: engine.scratchAvailable,
    scratchError: engine.scratchError,
  })
}

// Subscribed at module scope, deliberately not inside initAudio's first-run
// block. A worklet can die mid-render hours after boot, and anything wired only
// on the first initialisation is not wired at all if audio was already running
// — which is the same one-shot mistake that left the pill dead in the first place.
engine.onScratchStateChange = syncScratchState

export async function loadTrackToDeck(deckId: DeckId, track: Track) {
  await initAudio()
  const { patchDeck, setNotice, clearNotice } = useStore.getState()

  // Loading over a deck that is playing cuts a live track mid-set, and the
  // gesture that does it — double-click, or a LOAD button — is one keystroke
  // away from the one that loads the other deck. Refusing is the default, and
  // the refusal is spoken: a load that quietly does nothing looks like a dead
  // button, which is the failure mode this project treats as a bug.
  if (settings.values.lockPlayingDeck && engine.decks[deckId].playing) {
    setNotice({
      // The field's own label, not a copy of it. The first version of this
      // message hard-coded "Lock a playing deck"; the label was then reworded
      // and the message went on pointing at a control that no longer had that
      // name — a direction that sends the user looking for something they will
      // not find is its own small lie. tests/core/settings.test.ts fails if a
      // notice ever names a field that is not in the schema.
      text: `Deck ${deckId} is playing — load refused. Settings › Feel › ${FIELD_BY_KEY.get('lockPlayingDeck')?.label} turns this off.`,
      tone: 'warn',
      source: 'load',
    })
    return
  }
  // Only this function's own message is cleared. It used to clear the notice
  // outright, which threw away whatever else was up there — the
  // "your audio device is not connected" warning is set at startup and was
  // wiped by the first track load, before the owner could read it.
  clearNotice('load')
  patchDeck(deckId, { loading: true })
  try {
    const data = await readTrackData(track)
    const buffer = await engine.decode(data)
    // Read everything we need OUT of the buffer before handing it to the deck.
    // Deliberately defensive rather than currently required: the worklet player
    // copies the samples with copyFromChannel and transfers only those copies,
    // so today's AudioBuffer is not detached (see the note in players.ts). A
    // backend that took the buffer itself would detach it, and analysing after
    // the handoff would then yield a flat waveform and a null BPM with nothing
    // thrown. Cheap to keep the handoff last; invisible if it ever stops being.
    const durationSec = buffer.duration
    // One analysis bucket per ~1.3 rendered pixels. A fixed 2400 buckets meant
    // ~16/sec, so at 150px/sec each bucket smeared across 9 pixels and the
    // waveform came out as blocks — the old path fill hid it by interpolating.
    const buckets = Math.min(120_000, Math.max(2_000, Math.ceil(durationSec * 200)))
    const { peaks, bands } = analyzeWaveform(buffer, buckets)
    // A tag written by Serato still beats our own bpm guess — v0.1.7 measured
    // tag accuracy at 97% across the user's library, and detection is still
    // autocorrelation on an onset envelope, occasionally an octave off (see
    // core/beatgrid.ts). What v0.3.0 changes: detection is the *only* source
    // of phase (`offsetSec`) — tags carry no phase — so it always runs and its
    // grid is always kept, even when the tag wins on the bpm number itself.
    const detected = detectBeatGrid(buffer)
    const bpm = track.bpm ?? detected?.grid.bpm ?? null
    const beatGrid: BeatGrid | null = detected
      ? { bpm: bpm ?? detected.grid.bpm, offsetSec: detected.grid.offsetSec }
      : null
    // Unconfirmed whenever detection didn't produce a grid it trusts — never a
    // silently-assumed-fine grid. Cleared only by the user checking or editing
    // it (BeatGridPanel, v0.3.0 sub-step d).
    const beatGridConfirmed = detected ? detected.confident : false
    engine.decks[deckId].load(buffer)
    // write analysis back into the library entry so its BPM/Time columns
    // populate and mix recommendations have data to work with
    const { library, setLibrary } = useStore.getState()
    setLibrary({
      tracks: library.tracks.map((t) =>
        t.id === track.id
          ? { ...t, bpm: bpm ?? t.bpm, durationSec }
          : t,
      ),
    })
    // `firstCue` has nothing to read yet — cue points are not persisted with a
    // track until v0.4, so there is no stored cue at load time and the answer
    // is 0 either way. The Settings field carries that limitation in its own
    // `pending` line rather than the app pretending the choice took effect.
    const startSec = 0
    patchDeck(deckId, {
      track: { ...track, bpm: bpm ?? undefined, durationSec },
      loading: false,
      playing: false,
      positionSec: startSec,
      durationSec,
      bpm,
      beatGrid,
      beatGridConfirmed,
      syncActive: false,
      peaks,
      bands,
      hotCues: [],
      cuePointSec: startSec,
      loopActive: false,
    })
  } catch (err) {
    console.error('load failed', err)
    patchDeck(deckId, { loading: false })
    throw err
  }
}

export function togglePlay(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack) return
  deck.togglePlay()
  useStore.getState().patchDeck(deckId, { playing: deck.playing })
}

export function play(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack || deck.playing) return
  deck.play()
  useStore.getState().patchDeck(deckId, { playing: true })
}

export function pause(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.playing) return
  deck.pause()
  useStore.getState().patchDeck(deckId, { playing: false })
}

/** CUE button: if playing, stop and jump to cue point; if stopped, set cue point here. */
export function cue(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack) return
  const st = useStore.getState().decks[deckId]
  if (deck.playing) {
    deck.pause()
    deck.seek(st.cuePointSec)
    useStore.getState().patchDeck(deckId, { playing: false, positionSec: st.cuePointSec })
  } else if (Math.abs(deck.position - st.cuePointSec) > 0.05) {
    deck.seek(st.cuePointSec)
    useStore.getState().patchDeck(deckId, { positionSec: st.cuePointSec })
  } else {
    useStore.getState().patchDeck(deckId, { cuePointSec: deck.position })
  }
}

/** Hold CUE to preview from the cue point. Call release() when the button lifts. */
export function cuePlayPreview(deckId: DeckId): () => void {
  const deck = engine.decks[deckId]
  const st = useStore.getState().decks[deckId]
  if (!deck.hasTrack) return () => {}
  deck.seek(st.cuePointSec)
  deck.play()
  useStore.getState().patchDeck(deckId, { playing: true })
  return () => {
    deck.pause()
    deck.seek(st.cuePointSec)
    useStore.getState().patchDeck(deckId, { playing: false, positionSec: st.cuePointSec })
  }
}

export function seekDeck(deckId: DeckId, sec: number) {
  engine.decks[deckId].seek(sec)
  useStore.getState().patchDeck(deckId, { positionSec: sec })
}

/**
 * Platter grabbed. Both the on-screen platter and a jog-wheel touch land here,
 * which is the point of this module: one path, so a mouse drag and a finger on
 * the FLX4 cannot drift apart.
 */
export function beginScratch(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack) return
  deck.beginScratch()
  useStore.getState().patchDeck(deckId, { scratching: true, playing: deck.playing })
}

/** Rate in playback multiples while held: 1 = forward at speed, negative = back. */
export function scratchRate(deckId: DeckId, rate: number) {
  engine.decks[deckId].scratchRate(rate)
}

export function endScratch(deckId: DeckId) {
  const deck = engine.decks[deckId]
  deck.endScratch()
  useStore.getState().patchDeck(deckId, { scratching: false, playing: deck.playing })
}

/**
 * Jog-wheel ticks from a controller.
 *
 * The same wheel does two jobs, decided by whether the platter is being
 * touched — which is why the touch sensor is its own binding. Held: the wheel
 * is the record, and ticks become a scratch rate. Not held: the wheel is the
 * rim of a running deck, and ticks become a pitch bend that decays back.
 *
 * Ticks are converted to a rate over elapsed time rather than used directly,
 * so how fast the wheel is turned decides the rate, not how often the
 * controller happens to report.
 */
const jogState: Record<string, { time: number; rate: number }> = {}

/**
 * Ticks per revolution, smoothing and platter speed all live in Settings now
 * (`jogTicksPerRev`, `jogSmoothing`, `platterRpm`). They were hard-coded here
 * through v0.2.4, and changing one cost a full code -> commit -> push -> pull
 * -> restart round trip on hardware only the owner has. That round trip is what
 * v0.2.5 exists to remove.
 */
const JOG_MAX_RATE = 8
/**
 * Bend strength per tick when the platter is not held.
 *
 * Recalibrated 30/08 after the FLX4's decode was fixed, because this number was
 * silently tuned against the broken one. Every jog message used to arrive as
 * `ticks = 63`, so `63 * 0.012 = 0.756` clamped to the 0.5 ceiling — **every
 * touch of the rim jumped straight to the maximum ±50% bend**. It felt like it
 * worked; it was the bug, at full volume. With one message now correctly worth
 * one tick, the same constant gave 1.2% and the rim felt dead.
 *
 * Deliberately per-tick and not rate-based: `ticks` per message already grows
 * with speed (the FLX4 sends 65/66/67 for 1/2/3 ticks), and a rate would have to
 * divide by `JOG_TICKS_PER_REV`, which is still unmeasured. This value is
 * independent of that one, so it does not move when that number is finally set.
 *
 * It is a **feel** value — the ceiling below is the real safety net. Tune it here.
 *
 * 0.05 -> 0.10 on the owner's verdict after trying it on the FLX4: "very slow".
 * That lands the useful range where the commercial tools sit, because ticks per
 * message already scale with how hard the wheel is turned — the FLX4 sends
 * 65/66/67 for 1/2/3 ticks, so an easy nudge is ~10% and a hard shove ~30%,
 * with the ±0.5 clamp still catching a genuine spin.
 *
 * The default is `BEND_PER_TICK` in `core/constants.ts`; the live value is
 * `cfg.bendPerTick`, and the ±0.5 clamp below stays in code because it is the
 * safety net, not the preference.
 */

/**
 * Say what the jog just did — including when it did nothing, and why.
 *
 * Throttled, and that is not a nicety. The FLX4 sends ~670 jog messages per
 * revolution, so a store write per message is hundreds of React re-renders a
 * second, all of them to retype one line of text in the top bar. The first
 * version of this readout did exactly that and could plausibly have starved the
 * render loop that draws the playhead — a diagnostic that breaks the thing it
 * is diagnosing is worse than none. 10 Hz is faster than anyone reads.
 */
const JOG_REPORT_MS = 100
let lastJogReport = { at: 0, text: '' }

function reportJog(deckId: DeckId, what: string) {
  const text = `${deckId}: ${what}`
  const now = performance.now()
  if (text === lastJogReport.text && now - lastJogReport.at < JOG_REPORT_MS) return
  lastJogReport = { at: now, text }
  useStore.getState().setMidi({ lastJog: text })
}

/**
 * Jog measurement, for the Settings screen's "Measure" button.
 *
 * `JOG_TICKS_PER_REV` is a property of the controller and was never measurable
 * from here: three hand counts on the FLX4 gave 696 / 673 / 669, all lower
 * bounds, because counting revolutions by hand undercounts. This intercepts the
 * tick stream **before** bend and scratch, so a measuring turn moves the number
 * and not the deck — a wheel that scratched while being measured would be
 * counted through a moving track, which is how the earlier counts went wrong.
 */
let jogMeasure: {
  deckId: DeckId
  ticks: number
  onTick: (total: number) => void
  lastPaint: number
} | null = null

export function beginJogMeasure(deckId: DeckId, onTick: (total: number) => void): () => number {
  jogMeasure = { deckId, ticks: 0, onTick, lastPaint: 0 }
  return () => {
    const total = jogMeasure?.ticks ?? 0
    jogMeasure = null
    // The exact count comes from here, not from the throttled readout, so the
    // saved value is never the one a dropped repaint happened to show.
    onTick(total)
    return total
  }
}

export function jogTurn(deckId: DeckId, ticks: number) {
  if (jogMeasure && jogMeasure.deckId === deckId) {
    // Absolute value: a hand that wobbles back a tick mid-turn has still
    // travelled that tick, and signed accumulation would quietly subtract it.
    jogMeasure.ticks += Math.abs(ticks)
    // Throttled for the same reason the jog readout is (see JOG_REPORT_MS): the
    // FLX4 sends ~670 messages a second and each one arrives in its own MIDI
    // event, so an unthrottled setState here is ~670 React renders a second
    // during the one gesture whose smoothness the measurement depends on.
    const now = performance.now()
    if (now - jogMeasure.lastPaint >= JOG_REPORT_MS) {
      jogMeasure.lastPaint = now
      jogMeasure.onTick(jogMeasure.ticks)
    }
    reportJog(deckId, `measuring — ${jogMeasure.ticks} ticks`)
    return
  }

  const deck = engine.decks[deckId]
  if (!deck.hasTrack) {
    reportJog(deckId, 'ignored — no track loaded')
    return
  }

  if (!deck.scratching) {
    const amount = Math.max(-0.5, Math.min(0.5, ticks * cfg.bendPerTick))
    if (!deck.playing) {
      // The decision (30/08, with the owner): a stopped deck does nothing on the
      // rim — there is no speed to bend. It says so rather than looking broken.
      reportJog(deckId, `bend ${(amount * 100).toFixed(0)}% ignored — deck stopped`)
      return
    }
    deck.pitchBend(amount)
    reportJog(deckId, `bend ${amount > 0 ? '+' : ''}${(amount * 100).toFixed(0)}% (${ticks} ticks)`)
    return
  }

  const now = performance.now()
  const prev = jogState[deckId]
  const dt = prev ? (now - prev.time) / 1000 : 0
  if (dt <= 0) {
    jogState[deckId] = { time: now, rate: prev?.rate ?? 0 }
    return
  }
  const revs = ticks / cfg.jogTicksPerRev
  const instant = (revs * secPerRev(cfg.platterRpm)) / dt
  const smoothed = (prev?.rate ?? 0) + (instant - (prev?.rate ?? 0)) * cfg.jogSmoothing
  const rate = Math.max(-JOG_MAX_RATE, Math.min(JOG_MAX_RATE, smoothed))
  jogState[deckId] = { time: now, rate }
  deck.scratchRate(rate)
  reportJog(deckId, `scratch ${rate.toFixed(2)}x`)
}

/** Platter touch sensor: the hand landing on the record, and coming off it. */
export function jogTouch(deckId: DeckId, down: boolean) {
  // The Settings screen promises "the wheel will not move the deck while
  // measuring", and `jogTurn` alone did not keep it: the natural way to turn an
  // FLX4 wheel is by the top plate, which is the capacitive sensor, so a
  // measuring turn entered scratch mode at rate 0 and froze a live track for
  // the whole revolution. The ticks were counted correctly and the audio
  // stopped — the promise on screen has to cover the touch sensor too.
  if (jogMeasure && jogMeasure.deckId === deckId) return
  if (down) {
    jogState[deckId] = { time: performance.now(), rate: 0 }
    beginScratch(deckId)
  } else {
    delete jogState[deckId]
    endScratch(deckId)
  }
}

export function toggleVinylMode(deckId: DeckId) {
  const deck = engine.decks[deckId]
  const on = !deck.vinylMode
  deck.setVinylMode(on)
  useStore.getState().patchDeck(deckId, { vinylMode: on })
}

/**
 * Pitch bend held down and then let go — the keyboard's version of a hand on
 * the rim. Kept separate from `jogTurn`'s bend, which is per-tick and decays on
 * its own because a wheel tick has no release.
 *
 * No FLX4 control is bound to this: on the hardware the jog does the job. If a
 * button is ever mapped to it, it needs a `ControlAction` pair and a case in
 * `dispatch` — down and up, not one message.
 */
export function bendDeck(deckId: DeckId, amount: number) {
  engine.decks[deckId].holdBend(amount)
}

export function releaseBend(deckId: DeckId) {
  engine.decks[deckId].releaseBend()
}

export function nudgeDeck(deckId: DeckId, deltaSec: number) {
  const deck = engine.decks[deckId]
  seekDeck(deckId, deck.position + deltaSec)
}

export function setTempo(deckId: DeckId, tempo: number) {
  const t = Math.max(-1, Math.min(1, tempo))
  engine.decks[deckId].setTempo(t)
  useStore.getState().patchDeck(deckId, { tempo: t })
}

export function setHotCue(deckId: DeckId, index: number) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack) return
  const { patchDeck, decks } = useStore.getState()
  const cues = decks[deckId].hotCues
  const existing = cues.find((c) => c.index === index)
  if (existing) {
    deck.seek(existing.positionSec)
    patchDeck(deckId, { positionSec: existing.positionSec })
  } else {
    const next = [
      ...cues,
      {
        index,
        positionSec: deck.position,
        label: `${index + 1}`,
        color: HOT_CUE_COLORS[index % HOT_CUE_COLORS.length],
      },
    ].sort((a, b) => a.index - b.index)
    patchDeck(deckId, { hotCues: next })
  }
}

export function deleteHotCue(deckId: DeckId, index: number) {
  const { patchDeck, decks } = useStore.getState()
  patchDeck(deckId, {
    hotCues: decks[deckId].hotCues.filter((c) => c.index !== index),
  })
}

export function toggleLoop(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack) return
  const { patchDeck, decks } = useStore.getState()
  const st = decks[deckId]
  if (st.loopActive) {
    deck.clearLoop()
    patchDeck(deckId, { loopActive: false })
  } else {
    const bpm = st.bpm ?? 120
    const beatSec = 60 / bpm
    const start = deck.position
    deck.setLoop(start, start + beatSec * st.loopBeats)
    patchDeck(deckId, { loopActive: true })
  }
}

export function setLoopBeats(deckId: DeckId, beats: number) {
  const b = Math.max(0.25, Math.min(32, beats))
  const { patchDeck, decks } = useStore.getState()
  const st = decks[deckId]
  patchDeck(deckId, { loopBeats: b })
  if (st.loopActive && st.bpm) {
    const deck = engine.decks[deckId]
    const beatSec = 60 / st.bpm
    const start = deck.loopStart ?? deck.position
    deck.setLoop(start, start + beatSec * b)
  }
}

export function toggleCueMonitor(deckId: DeckId) {
  const deck = engine.decks[deckId]
  const on = !deck.cueMonitor
  deck.setCueMonitor(on)
  useStore.getState().patchDeck(deckId, { cueMonitor: on })
}

export function setChannelVolume(deckId: DeckId, v: number) {
  engine.decks[deckId].setVolume(v)
  useStore.getState().patchChannel(deckId, { volume: v })
}

export function setEq(deckId: DeckId, band: 'low' | 'mid' | 'high', v: number) {
  engine.decks[deckId].setEq(band, v)
  const key = band === 'low' ? 'eqLow' : band === 'mid' ? 'eqMid' : 'eqHigh'
  useStore.getState().patchChannel(deckId, { [key]: v })
}

export function setFilter(deckId: DeckId, v: number) {
  engine.decks[deckId].setFilter(v)
  useStore.getState().patchChannel(deckId, { filter: v })
}

export function setCrossfader(v: number) {
  engine.setCrossfader(v)
  useStore.getState().patchMixer({ crossfader: v })
}

export function setMasterVolume(v: number) {
  engine.setMasterVolume(v)
  useStore.getState().patchMixer({ masterVolume: v })
}

export function setCueVolume(v: number) {
  engine.setCueVolume(v)
  useStore.getState().patchMixer({ cueVolume: v })
}

export function setCueMix(v: number) {
  engine.setCueMix(v)
  useStore.getState().patchMixer({ cueMix: v })
}

// ————————————————————————————————————————————————————————————————
// Manual beat-grid correction (v0.3.0). No FLX4 control is bound to any of
// these: discovering which physical buttons are actually free needs the real
// hardware this remote session doesn't have, so guessing here would risk
// breaking a working mapping for no verifiable benefit. If one is ever
// mapped, it needs a `ControlAction` pair and a case in `dispatch`, the same
// as any other control — nothing here is exempt from the choke point, it is
// just not reachable from it yet.
// ————————————————————————————————————————————————————————————————

/** Mark the grid as looked at, edit or not — clears the "unconfirmed" pill. */
export function confirmBeatGrid(deckId: DeckId) {
  useStore.getState().patchDeck(deckId, { beatGridConfirmed: true })
}

export function nudgeBeatGrid(deckId: DeckId, deltaSec: number = BEATGRID_NUDGE_SEC) {
  const { patchDeck, decks } = useStore.getState()
  const grid = decks[deckId].beatGrid
  if (!grid) return
  const next = shiftGrid(grid, deltaSec)
  patchDeck(deckId, { beatGrid: next, bpm: next.bpm, beatGridConfirmed: true })
}

/** Corrects an octave-low guess — see core/beatgrid.ts's halveGrid. */
export function halveBeatGrid(deckId: DeckId) {
  const { patchDeck, decks } = useStore.getState()
  const grid = decks[deckId].beatGrid
  if (!grid) return
  const next = halveGrid(grid)
  patchDeck(deckId, { beatGrid: next, bpm: next.bpm, beatGridConfirmed: true })
}

/** Corrects an octave-high guess — see core/beatgrid.ts's doubleGrid. */
export function doubleBeatGrid(deckId: DeckId) {
  const { patchDeck, decks } = useStore.getState()
  const grid = decks[deckId].beatGrid
  if (!grid) return
  const next = doubleGrid(grid)
  patchDeck(deckId, { beatGrid: next, bpm: next.bpm, beatGridConfirmed: true })
}

/**
 * Beat 0 is wherever the playhead sits right now, at the grid's current bpm
 * (or the plain tag/detected bpm if there was no grid yet at all — this is
 * also how a track with no detectable periodicity gets a first grid).
 */
export function setDownbeatHere(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack) return
  const { patchDeck, decks } = useStore.getState()
  const bpm = decks[deckId].beatGrid?.bpm ?? decks[deckId].bpm
  if (!bpm) return
  const next = setDownbeatAt(bpm, deck.position)
  patchDeck(deckId, { beatGrid: next, bpm: next.bpm, beatGridConfirmed: true })
}

/** Per-deck tap timestamps for tapTempo, seconds since the page loaded. */
const tapTimesSec: Record<DeckId, number[]> = { A: [], B: [] }
/** A gap this long since the last tap starts a fresh tap sequence. */
const TAP_RESET_SEC = 2

/**
 * One call per tap (button press or key). Needs two taps to say anything;
 * every tap after that refines the estimate (core/beatgrid.ts's bpmFromTaps
 * rejects one fat-fingered interval on its own).
 */
export function tapTempo(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack) return
  const now = performance.now() / 1000
  const taps = tapTimesSec[deckId]
  if (taps.length > 0 && now - taps[taps.length - 1] > TAP_RESET_SEC) taps.length = 0
  taps.push(now)
  if (taps.length > 8) taps.shift() // bound memory; recent taps matter most
  const bpm = bpmFromTaps(taps)
  if (bpm == null) return
  const { patchDeck, decks } = useStore.getState()
  const offsetSec = decks[deckId].beatGrid?.offsetSec ?? 0
  patchDeck(deckId, { beatGrid: { bpm, offsetSec }, bpm, beatGridConfirmed: true })
}

/** Beat-match deck to the other deck's tempo (simple BPM match, no phase align yet). */
export function syncDeck(deckId: DeckId) {
  const other: DeckId = deckId === 'A' ? 'B' : 'A'
  const { decks } = useStore.getState()
  const src = decks[other].bpm
  const mine = decks[deckId].bpm
  if (!src || !mine) return
  const ratio = src / mine
  const tempo = (ratio - 1) / 0.08
  setTempo(deckId, tempo)
}

export function selectedTrack(): Track | undefined {
  const { library } = useStore.getState()
  return library.tracks.find((t) => t.id === library.selectedId)
}

export function moveSelection(delta: number) {
  const { library, setLibrary } = useStore.getState()
  const list = filteredTracks()
  if (list.length === 0) return
  const idx = list.findIndex((t) => t.id === library.selectedId)
  const nextIdx = idx < 0 ? 0 : Math.max(0, Math.min(list.length - 1, idx + delta))
  setLibrary({ selectedId: list[nextIdx].id })
}

export function filteredTracks(): Track[] {
  const { library } = useStore.getState()
  const q = library.query.trim().toLowerCase()
  if (!q) return library.tracks
  return library.tracks.filter(
    (t) =>
      t.path.toLowerCase().includes(q) ||
      t.artist?.toLowerCase().includes(q) ||
      t.title?.toLowerCase().includes(q),
  )
}

