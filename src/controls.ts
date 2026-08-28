import { detectBpm, computePeaks } from './audio/analyze'
import { engine } from './audio/engine'
import { HOT_CUE_COLORS } from './audio/constants'
import { readTrackData } from './library/library'
import { useStore } from './state/store'
import type { DeckId, Track } from './types'

/**
 * The control surface shared by the on-screen UI and the MIDI mapping layer.
 * Every user-facing action goes through here so a knob turn and a mouse drag
 * stay in sync.
 */

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
  }
}

export async function loadTrackToDeck(deckId: DeckId, track: Track) {
  await initAudio()
  const { patchDeck } = useStore.getState()
  patchDeck(deckId, { loading: true })
  try {
    const data = await readTrackData(track)
    const buffer = await engine.decode(data)
    engine.decks[deckId].load(buffer)
    const peaks = computePeaks(buffer, 2400)
    const bpm = detectBpm(buffer)
    // write analysis back into the library entry so its BPM/Time columns
    // populate and mix recommendations have data to work with
    const { library, setLibrary } = useStore.getState()
    setLibrary({
      tracks: library.tracks.map((t) =>
        t.id === track.id
          ? { ...t, bpm: bpm ?? t.bpm, durationSec: buffer.duration }
          : t,
      ),
    })
    patchDeck(deckId, {
      track: { ...track, bpm: bpm ?? undefined, durationSec: buffer.duration },
      loading: false,
      playing: false,
      positionSec: 0,
      durationSec: buffer.duration,
      bpm,
      peaks,
      hotCues: [],
      cuePointSec: 0,
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
  return library.tracks.filter((t) => t.path.toLowerCase().includes(q))
}
