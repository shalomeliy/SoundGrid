import { pcmFromAudioBuffer } from '@/platform/analyzer-js/analyze'
import { analysisCache } from '@/platform/analyze-cache-idb/store'
import { analyzerWorker } from '@/platform/analyzer-worker'
import { engine } from '@/platform/audio-webaudio/engine'
import {
  BEATGRID_NUDGE_SEC,
  HOT_CUE_COLORS,
  RECENTLY_REMOVED_WINDOW_SEC,
  TRANSITION_CROSSFADE_SEC,
} from '@/core/constants'
import {
  bpmFromTaps,
  doubleGrid,
  halveGrid,
  phaseDeltaSec,
  quantizeToGrid,
  setDownbeatAt,
  shiftGrid,
} from '@/core/beatgrid'
import { crossfadeProgress, phaseAlignedEntrySec } from '@/core/transition'
import { setGenreOverrideByHash } from '@/platform/genre-overrides-idb/store'
import { getCues, putCues } from '@/platform/cues-idb/store'
import { clock } from '@/platform/clock-audio'
import { readTrackData } from '@/platform/source-fsaccess/library'
import { hashBytes, hashFile } from '@/platform/source-fsaccess/hash'
import { settings } from '@/platform/settings-idb/store'
import { DEFAULTS, FIELD_BY_KEY, secPerRev, type Settings } from '@/core/settings'
import { moveHotCue as moveHotCuePure, pickHotCueSlot, shouldTriggerMixEntry } from '@/core/hotcues'
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

// ————————————————————————————————————————————————————————————————
// Mix Assist (v0.4.6), build step 9 — the 30s "don't suggest it right back"
// window. Module-level like `activeTransition` below, not the store: this is
// bookkeeping for the suggestion list, not UI state anything renders
// directly, and a `Map` with real timestamps has no reason to be
// serializable. Library.tsx reads `recentlyRemovedTrackIds()` on its own
// periodic tick so an id ages back out on its own, without this file having
// to schedule anything.
// ————————————————————————————————————————————————————————————————

const recentlyRemovedAt = new Map<string, number>()

function markRecentlyRemoved(trackId: string) {
  recentlyRemovedAt.set(trackId, Date.now())
}

/** Track ids still inside the window — and a free place to drop anything that's aged out, so the map never grows unbounded. */
export function recentlyRemovedTrackIds(nowMs: number = Date.now()): Set<string> {
  const ids = new Set<string>()
  for (const [id, at] of recentlyRemovedAt) {
    if (nowMs - at < RECENTLY_REMOVED_WINDOW_SEC * 1000) ids.add(id)
    else recentlyRemovedAt.delete(id)
  }
  return ids
}

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
  // A track swap on either side of a running autonomous transition would
  // pull the buffer out from under a live crossfade — `lockPlayingDeck`
  // (when the user has it on) already refuses this for whichever deck is
  // currently `playing`, but a transition can involve a deck this check
  // doesn't cover on its own, so cancel outright rather than let the load
  // proceed underneath it.
  if (activeTransition && (deckId === activeTransition.fromDeckId || deckId === activeTransition.toDeckId)) {
    cancelTransition()
  }
  patchDeck(deckId, { loading: true })
  let buffer: AudioBuffer
  let contentHash: string | undefined
  try {
    const data = await readTrackData(track)
    // Hashed from the raw file bytes, *before* decode — `decodeAudioData`
    // neuters its input `ArrayBuffer` per spec (its `byteLength` becomes 0
    // once decoding starts), so hashing `data` after `engine.decode(data)`
    // would silently hash an empty buffer and give every track the same
    // "identity". Caught on its own: a hash failure degrades to "not yet
    // identified" (`contentHash` stays `undefined`) rather than blocking
    // playback — the track still loads either way.
    try {
      contentHash = await hashBytes(data)
    } catch (hashErr) {
      console.error('hash failed', hashErr)
    }
    buffer = await engine.decode(data)
  } catch (err) {
    console.error('load failed', err)
    patchDeck(deckId, { loading: false })
    // Every call site fires this with `void` (mouse, keyboard, MIDI) and none
    // attaches its own `.catch` — a decode failure (corrupt file, or a file
    // whose extension matches but Chromium can't actually decode) used to
    // become only an unhandled rejection in the console while the UI looked
    // idle. Surface it the same way setTrackGenre surfaces its own async
    // failure, and stop re-throwing: nothing downstream was ever catching it.
    setNotice({
      text: `"${track.name}" didn't load — ${err instanceof Error ? err.message : String(err)}`,
      tone: 'warn',
      source: 'load',
    })
    return
  }
  const durationSec = buffer.duration
  // A hash failure above leaves `contentHash` `undefined` — "not yet
  // identified", same as a track whose analysis hasn't reached it yet. Its
  // cue bank simply isn't found, the same shape as a first-ever load.
  const storedCues = contentHash ? await getCues(contentHash) : null
  const cuePointSec = storedCues?.cuePointSec ?? 0
  // "First cue point" (Settings › Feel › On track load) means this saved CUE
  // point — the one thing `onLoadPlayhead` had nothing to read before this
  // version (core/settings.ts's `pending` note on the field, now resolved).
  const startSec = cfg.onLoadPlayhead === 'firstCue' ? cuePointSec : 0
  // Load the deck the moment decode finishes — never wait on analysis to let
  // the owner hear the track (v0.4.0: a not-yet-analyzed or failed-analysis
  // track still plays, per the owner's explicit decision; see
  // workshop-output/FEATURE_SPEC.md). `deck.load` only ever *copies* channel
  // samples out (`copyFromChannel` inside the worklet player), so `buffer`'s
  // own data is still fully intact and readable afterward — this is what
  // makes it safe to hand `buffer` to the deck first and extract PCM for
  // analysis second, below.
  // Mix Assist (v0.4.6): whatever this deck held before is now "just came
  // off a deck" — read before the overwrite below replaces it. Skipped when
  // it's the same track reloading onto itself: that one never left.
  const outgoingId = useStore.getState().decks[deckId].track?.id
  if (outgoingId && outgoingId !== track.id) markRecentlyRemoved(outgoingId)

  engine.decks[deckId].load(buffer)
  if (startSec > 0) engine.decks[deckId].seek(startSec)
  patchDeck(deckId, {
    track: { ...track, contentHash, bpm: track.bpm ?? undefined, durationSec },
    loading: false,
    playing: false,
    positionSec: startSec,
    durationSec,
    bpm: track.bpm ?? null,
    beatGrid: null,
    beatGridConfirmed: false,
    syncActive: false,
    peaks: null,
    bands: null,
    hotCues: storedCues?.hotCues ?? [],
    cuePointSec,
    loopActive: false,
  })
  const { library, setLibrary } = useStore.getState()
  setLibrary({
    tracks: library.tracks.map((t) => (t.id === track.id ? { ...t, contentHash, durationSec } : t)),
  })

  // Analysis is best-effort from here: the track is already loaded and
  // playable, so a failure here means "no waveform/grid yet", never "the
  // load failed" — caught on its own, never re-thrown to this function's
  // caller (v0.4.0 acceptance criterion 3).
  try {
    // No hash (a hashing failure above) means "not yet identified" — analysis
    // still runs so this load gets its waveform/grid, it just can't be cached
    // or looked up by identity yet.
    let analysis = contentHash ? await analysisCache.get(contentHash) : null
    if (!analysis) {
      // `pcmFromAudioBuffer` only now, not before `deck.load` above: the
      // Worker path transfers (detaches) these channel buffers, and nothing
      // else needs to read `buffer` again after this point.
      const pcm = pcmFromAudioBuffer(buffer)
      analysis = await analyzerWorker.analyze(pcm)
      if (contentHash) await analysisCache.put(contentHash, analysis)
    }
    // A fast second load on this same deck may have already replaced the
    // track this analysis was for — don't let a late result clobber it.
    if (useStore.getState().decks[deckId].track?.id !== track.id) return

    // A tag written by Serato still beats our own bpm guess — v0.1.7 measured
    // tag accuracy at 97% across the user's library, and detection is still
    // autocorrelation on an onset envelope, occasionally an octave off (see
    // core/beatgrid.ts). What v0.3.0 changes: detection is the *only* source
    // of phase (`offsetSec`) — tags carry no phase — so it always runs and its
    // grid is always kept, even when the tag wins on the bpm number itself.
    const bpm = track.bpm ?? analysis.bpm
    const beatGrid: BeatGrid | null = analysis.beatGrid
      ? { bpm: bpm ?? analysis.beatGrid.bpm, offsetSec: analysis.beatGrid.offsetSec }
      : null
    patchDeck(deckId, {
      track: { ...track, contentHash, analysisState: 'analyzed', bpm: bpm ?? undefined, durationSec },
      bpm,
      // Unconfirmed whenever detection didn't produce a grid it trusts — never
      // a silently-assumed-fine grid. Cleared only by the user checking or
      // editing it (BeatGridPanel, v0.3.0 sub-step d).
      beatGridConfirmed: analysis.beatGridConfirmed,
      beatGrid,
      peaks: analysis.peaks,
      bands: analysis.bands,
    })
    const { library: libAfter, setLibrary: setLibAfter } = useStore.getState()
    setLibAfter({
      tracks: libAfter.tracks.map((t) =>
        t.id === track.id ? { ...t, contentHash, analysisState: 'analyzed', bpm: bpm ?? t.bpm } : t,
      ),
    })
  } catch (err) {
    console.error('analysis failed', err)
    if (useStore.getState().decks[deckId].track?.id !== track.id) return
    const message = err instanceof Error ? err.message : String(err)
    patchDeck(deckId, {
      track: { ...track, contentHash, analysisState: 'failed', analysisError: message, durationSec },
    })
    const { library: libAfter, setLibrary: setLibAfter } = useStore.getState()
    setLibAfter({
      tracks: libAfter.tracks.map((t) =>
        t.id === track.id ? { ...t, contentHash, analysisState: 'failed', analysisError: message } : t,
      ),
    })
  }
}

/**
 * Mix Assist (v0.4.6): loading a suggested track is stricter than a manual
 * load — it must never land on a deck that already has *any* track on it,
 * even one that's merely paused (`loadTrackToDeck`'s own
 * `lockPlayingDeck` guard only refuses a deck that's actively playing). A
 * thin wrapper rather than a change to `loadTrackToDeck` itself: manual
 * double-click/drag loading keeps behaving exactly as it does today: this
 * only tightens the one new path a suggestion click takes.
 *
 * `awayFromDeck` is the deck the suggestion was matched against (`MixMatch.
 * deck`) — the suggestion belongs on the *other* deck, never on the one
 * already playing the track it was matched to.
 */
export function loadSuggestionToDeck(track: Track, awayFromDeck: DeckId) {
  const target: DeckId = awayFromDeck === 'A' ? 'B' : 'A'
  const { decks, setNotice } = useStore.getState()
  if (decks[target].track) {
    setNotice({
      text: `Deck ${target} already has a track loaded — unload it before loading a suggestion there.`,
      tone: 'warn',
      source: 'load',
    })
    return
  }
  void loadTrackToDeck(target, track)
}

/**
 * First deck to start playing becomes master by default (v0.3.0) — the
 * automatic half of "auto + manual override". A no-op once a master already
 * exists, whether set this way or by an explicit long-press. Deliberately not
 * wired to `cuePlayPreview`'s hold-to-preview: a momentary CUE-hold is not
 * "starting to play" in the sense a DJ means it.
 */
function maybeAutoMaster(deckId: DeckId) {
  if (useStore.getState().masterDeckId == null) useStore.setState({ masterDeckId: deckId })
}

export function togglePlay(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack) return
  // Captured before the guard: cancelling pauses+repositions the *incoming*
  // deck by itself (cancelTransition's own restore), and this is a *toggle* —
  // calling deck.togglePlay() afterward would see it now paused and flip it
  // right back to playing, undoing the very pause the user pressed for. The
  // outgoing deck is untouched by a cancel, so its own toggle below still
  // runs normally.
  const wasIncomingDeckOfTransition = activeTransition?.toDeckId === deckId
  cancelTransitionIfEitherDeckTouched(deckId)
  if (wasIncomingDeckOfTransition) return
  deck.togglePlay()
  useStore.getState().patchDeck(deckId, { playing: deck.playing })
  if (deck.playing) maybeAutoMaster(deckId)
}

export function play(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack || deck.playing) return
  deck.play()
  useStore.getState().patchDeck(deckId, { playing: true })
  maybeAutoMaster(deckId)
}

export function pause(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.playing) return
  cancelTransitionIfEitherDeckTouched(deckId)
  deck.pause()
  useStore.getState().patchDeck(deckId, { playing: false })
}

/**
 * Persist the current cue bank + CUE point for whatever track is on this deck
 * (v0.4.0). A no-op when the track has no `contentHash` yet (hash failed, or
 * hasn't been computed — see `loadTrackToDeck`): the edit still applies on
 * screen, it just isn't identified well enough to save yet. A write failure
 * is surfaced, not swallowed — the central rule this whole project is built
 * around — because a cue that looks set but silently isn't saved is worse
 * than one the user never tried to set.
 */
function persistCues(deckId: DeckId) {
  const { decks, setNotice } = useStore.getState()
  const st = decks[deckId]
  const hash = st.track?.contentHash
  if (!hash) return
  void putCues(hash, { hotCues: st.hotCues, cuePointSec: st.cuePointSec }).catch((err) => {
    setNotice({
      text: `Cue point set on screen but not saved: ${err instanceof Error ? err.message : String(err)}`,
      tone: 'warn',
      source: 'cues',
    })
  })
}

/** CUE button: if playing, stop and jump to cue point; if stopped, set cue point here. */
export function cue(deckId: DeckId) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack) return
  const st = useStore.getState().decks[deckId]
  if (deck.playing) {
    cancelTransitionIfEitherDeckTouched(deckId)
    deck.pause()
    deck.seek(st.cuePointSec)
    useStore.getState().patchDeck(deckId, { playing: false, positionSec: st.cuePointSec })
  } else if (Math.abs(deck.position - st.cuePointSec) > 0.05) {
    deck.seek(st.cuePointSec)
    useStore.getState().patchDeck(deckId, { positionSec: st.cuePointSec })
  } else {
    useStore.getState().patchDeck(deckId, { cuePointSec: quantizeIfOn(deckId, deck.position) })
    persistCues(deckId)
  }
}

/** Hold CUE to preview from the cue point. Call release() when the button lifts. */
export function cuePlayPreview(deckId: DeckId): () => void {
  const deck = engine.decks[deckId]
  const st = useStore.getState().decks[deckId]
  if (!deck.hasTrack) return () => {}
  cancelTransitionIfEitherDeckTouched(deckId)
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
  cancelTransitionIfEitherDeckTouched(deckId)
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
  cancelTransitionIfEitherDeckTouched(deckId)

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
  cancelTransitionIfEitherDeckTouched(deckId)
  engine.decks[deckId].holdBend(amount)
}

export function releaseBend(deckId: DeckId) {
  engine.decks[deckId].releaseBend()
}

export function nudgeDeck(deckId: DeckId, deltaSec: number) {
  const deck = engine.decks[deckId]
  seekDeck(deckId, deck.position + deltaSec)
}

/**
 * Touching the tempo fader breaks an active phase-lock (v0.3.0) — matches
 * real hardware, where grabbing the fader is how a DJ takes tempo back from
 * SYNC. `syncDeck`/`setMasterDeck` call this to *set* the matched tempo and
 * then set `syncActive: true` themselves right after, so that path is not
 * affected — only a caller that patches `tempo` alone, i.e. a manual touch.
 */
export function setTempo(deckId: DeckId, tempo: number) {
  // Safe against this same function's own internal callers (syncDeck /
  // setMasterDeck, re-matching the *incoming* or *outgoing* deck's tempo):
  // during an active transition those only ever target `toDeckId`, and by
  // the time `finishTransition` re-matches `fromDeckId` through
  // `setMasterDeck`, `activeTransition` is already cleared — so this only
  // ever fires for a genuine manual touch of the tempo fader.
  cancelTransitionIfOutgoingDeckTouched(deckId)
  const t = Math.max(-1, Math.min(1, tempo))
  engine.decks[deckId].setTempo(t)
  useStore.getState().patchDeck(deckId, { tempo: t, syncActive: false })
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
        positionSec: quantizeIfOn(deckId, deck.position),
        label: `${index + 1}`,
        color: HOT_CUE_COLORS[index % HOT_CUE_COLORS.length],
        createdAt: Date.now(),
      },
    ].sort((a, b) => a.index - b.index)
    patchDeck(deckId, { hotCues: next })
    persistCues(deckId)
  }
}

/**
 * The choke-point entry point for pressing a hot cue pad — UI (`PadGrid.tsx`)
 * and the FLX4's physical pads (`transport-webmidi/manager.ts:dispatch`,
 * `'hotcue'` case) both call this instead of `setHotCue` directly (v0.4.7,
 * fallback fixed v0.4.9).
 *
 * A pad saved by `saveMixEntryHotCue` carries a descriptive (non-ordinal)
 * label — pressing it re-runs the *same* automatic transition a first click
 * in `TransitionPointsPanel` would have started, phase-aligned entry and all,
 * instead of just parking the playhead there for the DJ to hit Play by hand
 * (the exact gap the owner asked to close: "I'll give the command, you land
 * it on the right beat"). But only when a transition actually makes sense
 * right now (`shouldTriggerMixEntry`, `core/hotcues.ts`) — this deck isn't
 * already playing, and the other deck is. Outside that window a mix-in pad
 * must never become a dead button that's *worse* than a plain one, so it
 * falls through to the ordinary `setHotCue` seek instead, exactly like every
 * other pad. Once the window check passes, `startAutoTransition`'s own
 * further refusals (no beat grid, a transition already running) still apply
 * and still show their own notice — this only guards the cases where
 * attempting a transition was never the right call in the first place.
 *
 * A plain numbered pad (`isOrdinalLabel`) keeps doing exactly what `setHotCue`
 * always did: jump-or-create. Changing *that* would break the ordinary hot-cue
 * workflow this project has shipped since v0.4.0.
 */
export function pressHotCue(deckId: DeckId, index: number) {
  const { decks } = useStore.getState()
  const cue = decks[deckId].hotCues.find((c) => c.index === index)
  const otherDeckId: DeckId = deckId === 'A' ? 'B' : 'A'
  if (shouldTriggerMixEntry(cue, decks[deckId].playing, decks[otherDeckId].playing)) {
    startAutoTransition(otherDeckId, deckId, cue!.positionSec)
    return
  }
  setHotCue(deckId, index)
}

export function deleteHotCue(deckId: DeckId, index: number) {
  const { patchDeck, decks } = useStore.getState()
  patchDeck(deckId, {
    hotCues: decks[deckId].hotCues.filter((c) => c.index !== index),
  })
  persistCues(deckId)
}

/**
 * Drag a hot cue pad onto another pad — relocate onto an empty one, swap with
 * an occupied one (v0.4.0, `PadGrid.tsx`). Pure logic lives in
 * `core/hotcues.ts`; this is the choke-point wrapper that patches the store
 * and persists, same shape as `setHotCue`/`deleteHotCue`.
 */
export function moveHotCue(deckId: DeckId, fromIndex: number, toIndex: number) {
  const { patchDeck, decks } = useStore.getState()
  const cues = decks[deckId].hotCues
  const next = moveHotCuePure(cues, fromIndex, toIndex)
  if (next === cues) return
  patchDeck(deckId, { hotCues: next })
  persistCues(deckId)
}

/**
 * Auto-save a chosen mix-in point as a hot cue (v0.4.7) — called alongside
 * `startAutoTransition` when the DJ picks a point in `TransitionPointsPanel`,
 * never on its own. Uses the first empty pad, or evicts the pad with the
 * oldest `createdAt` when all 8 are full (`pickHotCueSlot`, `core/hotcues.ts`)
 * — always a visible overwrite in the Pad Grid, never a silent one.
 */
export function saveMixEntryHotCue(deckId: DeckId, positionSec: number, label: string) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack) return
  const { patchDeck, decks } = useStore.getState()
  const cues = decks[deckId].hotCues
  const index = pickHotCueSlot(cues)
  const next = [
    ...cues.filter((c) => c.index !== index),
    { index, positionSec, label, color: HOT_CUE_COLORS[index % HOT_CUE_COLORS.length], createdAt: Date.now() },
  ].sort((a, b) => a.index - b.index)
  patchDeck(deckId, { hotCues: next })
  persistCues(deckId)
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
    const start = quantizeIfOn(deckId, deck.position)
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
  // Not a spec'd cancel trigger by itself (ROADMAP.md only names the outgoing
  // deck stopping or its SYNC/tempo being touched) — this exists so a manual
  // drag mid-transition takes the fader over cleanly instead of fighting the
  // autonomous fade, which drives the crossfader every frame via
  // `engine.setCrossfader` directly and never through this function.
  if (activeTransition) cancelTransition()
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

export function toggleQuantize() {
  useStore.setState((s) => ({ quantize: !s.quantize }))
}

/**
 * `sec` snapped to `deckId`'s beat grid when quantize is on, unchanged when
 * it's off or the deck has no grid to snap to. The no-grid case is never a
 * silent no-op — the user asked for quantize and didn't get it, so they're
 * told, once, via the notice line (CLAUDE.md's central rule again).
 */
function quantizeIfOn(deckId: DeckId, sec: number): number {
  const { quantize, decks, setNotice } = useStore.getState()
  if (!quantize) return sec
  const grid = decks[deckId].beatGrid
  if (!grid) {
    setNotice({
      text: `Quantize is on but deck ${deckId} has no beat grid yet — this point was set exactly, not snapped.`,
      tone: 'warn',
      source: 'quantize',
    })
    return sec
  }
  return quantizeToGrid(sec, grid)
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

// ————————————————————————————————————————————————————————————————
// Phase-align SYNC + master deck (v0.3.0)
//
// Why an ongoing correction loop and not a one-shot nudge on the SYNC press:
// once tempo faders match, both decks share one AudioContext clock, so there
// is no drift *source* between them except that each deck's detected bpm has
// finite precision (rounded to 0.1, core/beatgrid.ts). A ~0.1bpm error at 128
// bpm is ~0.08% — over two minutes that is up to ~0.1s of accumulated drift,
// enough to fail the "stays in phase" bar. A single correction at press-time
// cannot chase an error that only reveals itself gradually.
//
// Why this lives here and not in platform/: it needs engine.decks (rate
// control) and useStore (grid/master/quantize state) together, which is
// exactly what every other function in this file already does. Putting it in
// platform/audio-webaudio/ would mean platform/ reaching into
// @/app/state/store — a second copy of the one documented, deliberate
// boundary violation (.dependency-cruiser.cjs) that transport-webmidi/
// manager.ts already carries, which CLAUDE.md is explicit must not happen.
// ————————————————————————————————————————————————————————————————

const SYNC_LOOP_INTERVAL_SEC = 1
/** Below this phase gap, a correction would be smaller than it's worth firing. */
const SYNC_PHASE_DEADBAND_SEC = 0.004

let syncLoopStarted = false
/** Subscribed once, ever — same lifetime as useRenderLoop's clock subscription. Each deck's own `syncActive` flag is what turns correction on and off, not this. */
function ensureSyncLoop() {
  if (syncLoopStarted) return
  syncLoopStarted = true
  let last = 0
  clock.subscribe((t) => {
    if (t - last < SYNC_LOOP_INTERVAL_SEC) return
    last = t
    runSyncCorrection()
  })
}

function runSyncCorrection() {
  const { decks, masterDeckId } = useStore.getState()
  if (!masterDeckId) return
  const master = decks[masterDeckId]
  for (const id of ['A', 'B'] as DeckId[]) {
    if (id === masterDeckId) continue
    const st = decks[id]
    if (!st.syncActive || !st.playing || !master.playing) continue
    if (!st.beatGrid || !master.beatGrid) continue
    const deck = engine.decks[id]
    const masterDeck = engine.decks[masterDeckId]
    const delta = phaseDeltaSec(deck.position, st.beatGrid, masterDeck.position, master.beatGrid)
    if (Math.abs(delta) < SYNC_PHASE_DEADBAND_SEC) continue
    deck.syncNudge(delta, SYNC_LOOP_INTERVAL_SEC)
  }
}

/**
 * SYNC: match tempo to the master deck (auto-resolved to the other deck if
 * none is set yet), then keep phase-locked to it until pressed again, the
 * tempo fader is touched (setTempo), or a new track loads (loadTrackToDeck) —
 * all three already patch `syncActive: false`. Pressing SYNC on the deck
 * that is already master is a no-op with a notice, not a silent nothing:
 * there is nothing beneath the master to lock to.
 */
export function syncDeck(deckId: DeckId) {
  if (!engine.decks[deckId].hasTrack) return
  // This function's own internal caller (`startAutoTransition`'s
  // seek-then-sync handoff) only ever targets the *incoming* deck, so this
  // can only cancel on a genuine manual SYNC tap on the outgoing deck.
  cancelTransitionIfOutgoingDeckTouched(deckId)
  const other: DeckId = deckId === 'A' ? 'B' : 'A'
  const { decks, masterDeckId, patchDeck, setNotice } = useStore.getState()
  const st = decks[deckId]

  if (st.syncActive) {
    patchDeck(deckId, { syncActive: false })
    return
  }

  const resolvedMaster = masterDeckId ?? other
  if (resolvedMaster === deckId) {
    setNotice({
      text: `Deck ${deckId} is already master — long-press SYNC on deck ${other} to make it master instead.`,
      tone: 'warn',
      source: 'sync',
    })
    return
  }
  // Checked and named separately — blaming the master deck for a gap that
  // was actually on this deck (or vice versa) sends the user troubleshooting
  // the wrong one.
  if (!st.bpm) {
    setNotice({
      text: `Deck ${deckId} has no tempo yet — nothing to sync from.`,
      tone: 'warn',
      source: 'sync',
    })
    return
  }
  const master = decks[resolvedMaster]
  if (!master.bpm || !master.beatGrid) {
    setNotice({
      text: `Deck ${resolvedMaster} has no tempo/grid yet — nothing to sync to.`,
      tone: 'warn',
      source: 'sync',
    })
    return
  }

  if (masterDeckId == null) useStore.setState({ masterDeckId: resolvedMaster })
  const ratio = master.bpm / st.bpm
  const tempo = (ratio - 1) / settings.values.tempoRange
  setTempo(deckId, tempo)
  patchDeck(deckId, { syncActive: true })
  ensureSyncLoop()
}

/**
 * Explicit master override — SYNC long-press (v0.3.0). Always wins over the
 * automatic pick. A deck already phase-locked (syncActive) to the old master
 * is re-engaged against the new one rather than dropped: the point of
 * overriding master mid-mix is to keep mixing, not to have to press SYNC
 * again. The deck being promoted can't stay locked to what it used to follow.
 */
export function setMasterDeck(deckId: DeckId) {
  const { decks, patchDeck } = useStore.getState()
  useStore.setState({ masterDeckId: deckId })
  if (decks[deckId].syncActive) patchDeck(deckId, { syncActive: false })

  const other: DeckId = deckId === 'A' ? 'B' : 'A'
  const st = decks[other]
  if (!st.syncActive) return
  const master = decks[deckId]
  const mine = st.bpm
  if (!master.bpm || !mine) return
  const ratio = master.bpm / mine
  const tempo = (ratio - 1) / settings.values.tempoRange
  setTempo(other, tempo)
  patchDeck(other, { syncActive: true })
  ensureSyncLoop()
}

// ————————————————————————————————————————————————————————————————
// Mix Assist (v0.4.6), build step 7 — the autonomous transition itself.
// ROADMAP.md flags this as the riskiest step in the version: it drives the
// live crossfader and a second deck's playback on a timer, unattended. The
// module-level `activeTransition` below is the imperative half (the running
// rAF-driven fade, the state to cancel back to) — same split as
// `ensureSyncLoop`'s own module-level subscription just above. The store's
// `activeTransition` field is only the serializable half Mixer.tsx reads to
// show its cancel button.
// ————————————————————————————————————————————————————————————————

interface ActiveTransition {
  fromDeckId: DeckId
  toDeckId: DeckId
  /** what the incoming deck looked like right before this transition touched it — what `cancelTransition` restores. */
  toPreState: { positionSec: number; playing: boolean }
  startedAtSec: number
  unsubscribe: () => void
}

let activeTransition: ActiveTransition | null = null

/**
 * For `setTempo`/`syncDeck` only: this file's own seek-then-sync handoff
 * calls both of those, but only ever on the *incoming* deck (`syncDeck`
 * internally calls `setTempo` too) — so a guard keyed on the outgoing deck
 * alone can see a manual touch there without ever seeing its own internal
 * calls and self-cancelling.
 */
function cancelTransitionIfOutgoingDeckTouched(deckId: DeckId) {
  if (activeTransition && deckId === activeTransition.fromDeckId) cancelTransition()
}

/**
 * For every other manual action this file itself never performs on *either*
 * transition deck through these same wrapper functions (`startAutoTransition`
 * drives the incoming deck through the raw engine object directly —
 * `toEngine.seek`/`toEngine.play`, never `ctl.play`/`ctl.togglePlay`) — so
 * both sides can be guarded with no self-cancel risk. ROADMAP.md: "any
 * change to the playing deck before the transition completes — the track
 * stops, or the user touches SYNC/pitch by hand — cancels automatically";
 * this applies it to the *incoming* deck too, since pausing/re-cueing/
 * scratching/bending the deck that's mid-join is just as much "taking the
 * mix back by hand" as doing it to the deck that was already playing.
 */
function cancelTransitionIfEitherDeckTouched(deckId: DeckId) {
  if (
    activeTransition &&
    (deckId === activeTransition.fromDeckId || deckId === activeTransition.toDeckId)
  ) {
    cancelTransition()
  }
}

/**
 * Seek-then-sync (ROADMAP.md v0.4.6): the incoming deck is aligned and
 * started while the crossfader still sits fully on the outgoing deck (so the
 * join is inaudible), then handed to the existing `syncDeck`/`ensureSyncLoop`
 * for continuous correction exactly like a manually-pressed SYNC would be.
 * From there a `clock`-driven loop (the same shared rAF source
 * `ensureSyncLoop` itself subscribes to) drives the crossfader through
 * `core/transition.ts`'s `crossfadeProgress` over `TRANSITION_CROSSFADE_SEC`,
 * via `engine.setCrossfader` — the exact equal-power law
 * `core/transition.ts`'s own `crossfadeGains` documents and
 * `tests/core/transition.test.ts` pins, so the autonomous fade sounds like
 * the same crossfader curve the user's hand already knows.
 *
 * Refuses (with a notice, never a silent no-op) rather than start a
 * transition it cannot phase-align or that would land on a deck that is not
 * cleanly available — a deck already mid-load, or already playing.
 */
/** `engine.setCrossfader`'s domain is -1 (A only) .. +1 (B only) — the extreme fully on `fromDeckId`. */
function crossfaderExtremeFor(fromDeckId: DeckId): number {
  return fromDeckId === 'A' ? -1 : 1
}

export function startAutoTransition(fromDeckId: DeckId, toDeckId: DeckId, entrySec: number) {
  const { decks, setNotice } = useStore.getState()
  if (activeTransition) {
    setNotice({ text: 'A transition is already running — cancel it before starting another.', tone: 'warn', source: 'sync' })
    return
  }
  const from = decks[fromDeckId]
  const to = decks[toDeckId]
  if (!from.playing || !to.track || to.playing || to.loading) {
    setNotice({
      text: `Can't start that transition — deck ${fromDeckId} isn't playing, or deck ${toDeckId} isn't a loaded, paused track.`,
      tone: 'warn',
      source: 'sync',
    })
    return
  }
  if (!from.beatGrid || !to.beatGrid) {
    setNotice({
      text: `Can't phase-align this transition — deck ${!from.beatGrid ? fromDeckId : toDeckId} has no beat grid yet.`,
      tone: 'warn',
      source: 'sync',
    })
    return
  }

  const fromEngine = engine.decks[fromDeckId]
  const toEngine = engine.decks[toDeckId]
  const enterSec = phaseAlignedEntrySec(entrySec, to.beatGrid, fromEngine.position, from.beatGrid)

  // Establish the join point explicitly rather than trust whatever the live
  // crossfader already happens to read — ROADMAP.md requires the incoming
  // deck to start while the crossfader "still sits fully" on the outgoing
  // one, and a manual nudge earlier (while only one deck was playing) could
  // otherwise leave it short of that extreme.
  const startExtreme = crossfaderExtremeFor(fromDeckId)
  engine.setCrossfader(startExtreme)
  useStore.getState().patchMixer({ crossfader: startExtreme })

  toEngine.seek(enterSec)
  toEngine.play()
  useStore.getState().patchDeck(toDeckId, { playing: true, positionSec: enterSec })
  // The reference this transition is built on is `fromDeckId`, regardless of
  // whatever `masterDeckId` happened to hold before — asserted explicitly so
  // `syncDeck`'s "already master" no-op branch (only reachable if `toDeckId`
  // happened to be a stale master from something it played earlier) can
  // never silently skip the handoff and leave phase drift uncorrected for
  // the rest of the fade.
  if (useStore.getState().masterDeckId !== fromDeckId) {
    useStore.setState({ masterDeckId: fromDeckId })
  }
  syncDeck(toDeckId)

  const startedAtSec = engine.currentTime
  const unsubscribe = clock.subscribe((t) => {
    const progress = crossfadeProgress(t - startedAtSec, TRANSITION_CROSSFADE_SEC)
    // engine.setCrossfader's own domain is -1 (A only) .. +1 (B only); this
    // maps `progress` onto whichever half of that range moves *away* from
    // `fromDeckId`, in either direction.
    const x = fromDeckId === 'A' ? -1 + 2 * progress : 1 - 2 * progress
    engine.setCrossfader(x)
    useStore.getState().patchMixer({ crossfader: x })
    if (progress >= 1) finishTransition()
  })

  activeTransition = {
    fromDeckId,
    toDeckId,
    toPreState: { positionSec: to.positionSec, playing: to.playing },
    startedAtSec,
    unsubscribe,
  }
  useStore.setState({ activeTransition: { fromDeckId, toDeckId } })
}

/**
 * Crossfade reached 100% (ROADMAP.md): the incoming deck becomes
 * master-sync automatically, and the cancel button disappearing (via
 * `activeTransition` clearing) is the only signal the transition ended.
 */
function finishTransition() {
  const t = activeTransition
  if (!t) return
  activeTransition = null
  t.unsubscribe()
  useStore.setState({ activeTransition: null })
  setMasterDeck(t.toDeckId)
}

/**
 * The cancel button (Mixer.tsx): fixed, prominent, no confirmation dialog.
 * Both decks return to exactly their pre-transition state — the outgoing
 * deck was never touched by this code, so only the crossfader (back to
 * fully on it) and the incoming deck (paused, seeked back) need restoring —
 * and no further automatic correction fires afterward: clearing
 * `syncActive` here is what keeps `runSyncCorrection`'s loop from touching
 * the incoming deck again once it is silent and paused.
 */
export function cancelTransition() {
  const t = activeTransition
  if (!t) return
  activeTransition = null
  t.unsubscribe()
  useStore.setState({ activeTransition: null })

  const toEngine = engine.decks[t.toDeckId]
  toEngine.pause()
  toEngine.seek(t.toPreState.positionSec)
  useStore.getState().patchDeck(t.toDeckId, {
    playing: t.toPreState.playing,
    positionSec: t.toPreState.positionSec,
    syncActive: false,
  })

  const x = crossfaderExtremeFor(t.fromDeckId)
  engine.setCrossfader(x)
  useStore.getState().patchMixer({ crossfader: x })
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
      t.title?.toLowerCase().includes(q) ||
      t.genre?.toLowerCase().includes(q),
  )
}

/**
 * Manual genre pick — the choke point for this action, called from the
 * library table's dropdown. Updates the store immediately so the cell
 * reflects the choice with no round-trip wait, then persists it; a write
 * failure keeps the in-memory value (an edit that silently reverts on the
 * next render is worse than one that silently fails to survive a reload) and
 * surfaces through the existing notice banner rather than a swallowed catch.
 *
 * Persisted by content hash since v0.4.0, not `trackId` (a scan-relative
 * path) — this is what makes the override survive the file turning up in a
 * different genre folder later. Most tracks already have `contentHash` by
 * the time an owner gets around to overriding their genre (the background
 * queue reaches them first); the ones that don't — a pick made right after a
 * fresh scan, before that queue catches up — get a one-off single-file hash
 * here (`hashFile`, the same on-demand path `core/types.ts`'s own doc
 * comment names), and that hash is kept on the track so nothing re-hashes it
 * a second time later.
 */
export function setTrackGenre(trackId: string, genre: string) {
  const { library, setLibrary, setNotice } = useStore.getState()
  setLibrary({
    tracks: library.tracks.map((t) => (t.id === trackId ? { ...t, genre } : t)),
  })
  void persistGenreOverride(trackId, genre).catch((err) => {
    setNotice({
      text: `Genre change applied but not saved: ${err instanceof Error ? err.message : String(err)}`,
      tone: 'warn',
      source: 'library',
    })
  })
}

async function persistGenreOverride(trackId: string, genre: string): Promise<void> {
  const track = useStore.getState().library.tracks.find((t) => t.id === trackId)
  if (!track) return // rescanned/removed since the click — nothing left to persist against
  let hash = track.contentHash
  if (!hash) {
    hash = await hashFile(track.handle)
    const { library, setLibrary } = useStore.getState()
    setLibrary({
      tracks: library.tracks.map((t) => (t.id === trackId ? { ...t, contentHash: hash } : t)),
    })
  }
  await setGenreOverrideByHash(hash, genre)
}

