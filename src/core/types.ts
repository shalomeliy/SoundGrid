export type DeckId = 'A' | 'B'

export interface Track {
  id: string
  name: string
  /** relative path inside the chosen library folder */
  path: string
  kind: string
  /** lazily-resolved file handle from the File System Access API */
  handle: FileSystemFileHandle
  bpm?: number
  durationSec?: number
  /** from the file's tags (v0.1.7) — analysis overrides these when it runs */
  artist?: string
  title?: string
  album?: string
  /** display spelling of the musical key, e.g. `Am` */
  key?: string
  /** Camelot code for the key, e.g. `8A` — what harmonic matching compares */
  camelot?: string
}

export interface HotCue {
  index: number
  positionSec: number
  label: string
  color: string
}

export interface DeckState {
  id: DeckId
  track: Track | null
  loading: boolean
  playing: boolean
  /** playhead position in seconds */
  positionSec: number
  durationSec: number
  /** detected / edited bpm of the loaded track */
  bpm: number | null
  /** tempo fader value, -1..1 mapped to +/- range (see TEMPO_RANGE) */
  tempo: number
  /** normalised waveform peaks for rendering (min/max interleaved) */
  peaks: Float32Array | null
  /** per-bucket low/mid/high energy, 3 per bucket — colours the waveform */
  bands: Float32Array | null
  hotCues: HotCue[]
  /** temp cue point set with the CUE button */
  cuePointSec: number
  /** vinyl mode: stop and start spin down and up instead of cutting */
  vinylMode: boolean
  /** a hand is on the platter right now */
  scratching: boolean
  loopActive: boolean
  loopBeats: number
  cueMonitor: boolean
}

export interface ChannelState {
  /** 0..1 line fader */
  volume: number
  /** -1..1 -> -26dB..+26dB per band */
  eqLow: number
  eqMid: number
  eqHigh: number
  /** -1..1 color/filter knob, 0 = bypass */
  filter: number
}

export interface MixerState {
  /** -1 (full A) .. +1 (full B) */
  crossfader: number
  masterVolume: number
  /** headphone cue: 0 = cue only, 1 = master only */
  cueMix: number
  cueVolume: number
  channels: Record<DeckId, ChannelState>
}

export type MidiStatus = 'unsupported' | 'idle' | 'requesting' | 'ready' | 'denied'

export interface MidiDeviceInfo {
  id: string
  name: string
  manufacturer: string
}
