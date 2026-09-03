import type { LibraryBoot } from '@/core/library-boot'
import { create } from 'zustand'
import type {
  ChannelState,
  DeckId,
  DeckState,
  MidiDeviceInfo,
  MidiStatus,
  MixerState,
  Track,
} from '@/core/types'
import type { Capabilities } from '@/core/ports'
import { detectCapabilities } from '@/platform/capabilities'

/** Who put a message on screen, so only they can take it down. */
export type NoticeSource = 'load' | 'output' | 'library' | 'quantize' | 'sync'

function emptyDeck(id: DeckId): DeckState {
  return {
    id,
    track: null,
    loading: false,
    playing: false,
    positionSec: 0,
    durationSec: 0,
    bpm: null,
    beatGrid: null,
    beatGridConfirmed: true,
    syncActive: false,
    tempo: 0,
    peaks: null,
    bands: null,
    hotCues: [],
    cuePointSec: 0,
    vinylMode: true,
    scratching: false,
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

  /**
   * Which deck SYNC's phase-align locks the other deck to (v0.3.0). `null`
   * until a deck starts playing (auto-set from there) or the user overrides
   * it with a long-press on a deck's SYNC button.
   */
  masterDeckId: DeckId | null
  /**
   * Global, off-by-default. When on, CUE/hot cues/loops snap new points to
   * the active deck's beat grid (v0.3.0) — never on the branches that seek to
   * an *existing* point, only where a new one is being set.
   */
  quantize: boolean

  library: {
    folderName: string | null
    tracks: Track[]
    scanning: boolean
    scanMsg: string
    query: string
    selectedId: string | null
    /** files the scan walked past, by extension — never skip silently */
    skipped: Record<string, number>
    /** tracks whose parent folder matched no known genre, by folder name (v0.3.2) */
    unrecognizedGenre: Record<string, number>
    supported: boolean
    /**
     * Which of the startup situations we are in (v0.2.6). An empty track list
     * is never on its own enough: this is what turns "nothing here" into a
     * sentence, and it is the reason the panel can tell a first visit from a
     * revoked permission from a folder that was renamed.
     */
    boot: LibraryBoot
    /** the browser's own words when a scan failed, so `failed` can quote them */
    bootDetail: string | null
    /** listed tracks whose file could not be read — counted, never swallowed */
    unreadable: number
  }

  midi: {
    status: MidiStatus
    devices: MidiDeviceInfo[]
    lastMessage: string | null
    /**
     * What the app DID with the last jog message, including "nothing, because".
     * The jog has three silent exits — no track, deck not playing, already
     * scratching — and a rim that does nothing looks identical to a rim that is
     * not connected. That ambiguity cost a whole debugging round on real
     * hardware, which is exactly what "never skip silently" exists to prevent.
     */
    lastJog: string | null
    learning: string | null
  }

  output: {
    devices: { deviceId: string; label: string }[]
    currentId: string | null
    multichannel: boolean
    sinkSupported: boolean
  }

  audioReady: boolean

  /**
   * Whether the deck's scratch engine is running. False means the AudioWorklet
   * could not be loaded and the decks fell back to AudioBufferSourceNode, which
   * plays correctly but cannot reverse or hold the read pointer. `scratchError`
   * carries the reason, and the UI states both — a deck that answers a scratch
   * with a seek and says nothing is the failure this project forbids.
   */
  scratchReady: boolean
  scratchError: string | null

  /** what this machine supports, resolved once at boot (v0.1.6) */
  capabilities: Capabilities

  /**
   * One line telling the user something the app just refused or changed on its
   * own, and why.
   *
   * Added in v0.2.5 for the first setting that makes the app say no: "Lock a
   * playing deck" turns a load into a refusal, and a load that silently does
   * nothing is indistinguishable from a broken button. Anything that declines,
   * degrades or substitutes belongs here rather than in a `console.warn`.
   */
  notice: { text: string; tone: 'warn' | 'info'; source: NoticeSource } | null

  patchDeck: (id: DeckId, patch: Partial<DeckState>) => void
  patchChannel: (id: DeckId, patch: Partial<ChannelState>) => void
  patchMixer: (patch: Partial<Omit<MixerState, 'channels'>>) => void
  set: <K extends keyof AppState>(key: K, value: AppState[K]) => void
  setLibrary: (patch: Partial<AppState['library']>) => void
  setMidi: (patch: Partial<AppState['midi']>) => void
  setOutput: (patch: Partial<AppState['output']>) => void
  setNotice: (notice: AppState['notice']) => void
  /**
   * Clear the notice only if it came from `source`.
   *
   * A plain `setNotice(null)` throws away whoever else's message is up there,
   * and the one that was being lost is the one that matters most: "the audio
   * device you last used is not connected" is set at startup and was wiped by
   * the first track load, before it could be read.
   */
  clearNotice: (source: NoticeSource) => void
}

export const useStore = create<AppState>((set) => ({
  decks: { A: emptyDeck('A'), B: emptyDeck('B') },
  masterDeckId: null,
  quantize: false,
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
    unrecognizedGenre: {},
    supported: true,
    boot: 'checking',
    bootDetail: null,
    unreadable: 0,
  },
  midi: { status: 'idle', devices: [], lastMessage: null, lastJog: null, learning: null },
  output: { devices: [], currentId: null, multichannel: false, sinkSupported: false },
  audioReady: false,
  scratchReady: false,
  scratchError: null,
  capabilities: detectCapabilities(),
  notice: null,

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
  setNotice: (notice) => set({ notice }),
  clearNotice: (source) => set((s) => (s.notice?.source === source ? { notice: null } : {})),
}))
