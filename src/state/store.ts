import { create } from 'zustand'
import type {
  ChannelState,
  DeckId,
  DeckState,
  MidiDeviceInfo,
  MidiStatus,
  MixerState,
  Track,
} from '../types'
import type { Capabilities } from '../core/ports'
import { detectCapabilities } from '../platform/capabilities'

function emptyDeck(id: DeckId): DeckState {
  return {
    id,
    track: null,
    loading: false,
    playing: false,
    positionSec: 0,
    durationSec: 0,
    bpm: null,
    tempo: 0,
    peaks: null,
    bands: null,
    hotCues: [],
    cuePointSec: 0,
    loopActive: false,
    loopBeats: 4,
    cueMonitor: false,
  }
}

function emptyChannel(): ChannelState {
  return { volume: 0.9, eqLow: 0, eqMid: 0, eqHigh: 0, filter: 0 }
}

export interface AppState {
  decks: Record<DeckId, DeckState>
  mixer: MixerState

  library: {
    folderName: string | null
    tracks: Track[]
    scanning: boolean
    scanMsg: string
    query: string
    selectedId: string | null
    /** files the scan walked past, by extension — never skip silently */
    skipped: Record<string, number>
    supported: boolean
  }

  midi: {
    status: MidiStatus
    devices: MidiDeviceInfo[]
    lastMessage: string | null
    learning: string | null
  }

  output: {
    devices: { deviceId: string; label: string }[]
    currentId: string | null
    multichannel: boolean
    sinkSupported: boolean
  }

  audioReady: boolean

  /** what this machine supports, resolved once at boot (v0.1.6) */
  capabilities: Capabilities

  patchDeck: (id: DeckId, patch: Partial<DeckState>) => void
  patchChannel: (id: DeckId, patch: Partial<ChannelState>) => void
  patchMixer: (patch: Partial<Omit<MixerState, 'channels'>>) => void
  set: <K extends keyof AppState>(key: K, value: AppState[K]) => void
  setLibrary: (patch: Partial<AppState['library']>) => void
  setMidi: (patch: Partial<AppState['midi']>) => void
  setOutput: (patch: Partial<AppState['output']>) => void
}

export const useStore = create<AppState>((set) => ({
  decks: { A: emptyDeck('A'), B: emptyDeck('B') },
  mixer: {
    crossfader: 0,
    masterVolume: 0.85,
    cueMix: 0.5,
    cueVolume: 0.7,
    channels: { A: emptyChannel(), B: emptyChannel() },
  },
  library: {
    folderName: null,
    tracks: [],
    scanning: false,
    scanMsg: '',
    query: '',
    selectedId: null,
    skipped: {},
    supported: true,
  },
  midi: { status: 'idle', devices: [], lastMessage: null, learning: null },
  output: { devices: [], currentId: null, multichannel: false, sinkSupported: false },
  audioReady: false,
  capabilities: detectCapabilities(),

  patchDeck: (id, patch) =>
    set((s) => ({ decks: { ...s.decks, [id]: { ...s.decks[id], ...patch } } })),
  patchChannel: (id, patch) =>
    set((s) => ({
      mixer: {
        ...s.mixer,
        channels: { ...s.mixer.channels, [id]: { ...s.mixer.channels[id], ...patch } },
      },
    })),
  patchMixer: (patch) => set((s) => ({ mixer: { ...s.mixer, ...patch } })),
  set: (key, value) => set({ [key]: value } as Partial<AppState>),
  setLibrary: (patch) => set((s) => ({ library: { ...s.library, ...patch } })),
  setMidi: (patch) => set((s) => ({ midi: { ...s.midi, ...patch } })),
  setOutput: (patch) => set((s) => ({ output: { ...s.output, ...patch } })),
}))
