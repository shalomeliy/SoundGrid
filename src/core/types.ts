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
  /**
   * From the immediate parent folder at scan time (v0.3.2), overridden by a
   * manual pick from `core/genres.ts`'s `GENRES` list when the owner sets one.
   * Undefined means neither source produced a value — never a silent blank
   * mistaken for "no genre folder exists".
   */
  genre?: string
  /**
   * SHA-256 of the file's full content (v0.4.0) — the identity genre
   * overrides, hot cues and the analysis cache actually key on, not `id`
   * (which stays scan-relative-path-based, unchanged, for React/selection
   * stability). Filled in lazily: for free as a side effect of loading this
   * track to a deck or of the background analysis queue reaching it, or
   * on-demand for a single track (e.g. a genre edit from the library table
   * before either of those has happened). Undefined means "not yet
   * identified" — never treated as "this track has no identity".
   */
  contentHash?: string
  /** Where this track's background analysis is, driving the library row icon — never inferred from `bpm` (that already fills from tags before analysis runs). */
  analysisState?: 'queued' | 'analyzing' | 'analyzed' | 'failed'
  /** Set only when `analysisState` is `'failed'` — a short, named reason, shown in the row icon's tooltip. */
  analysisError?: string
}

export interface HotCue {
  index: number
  positionSec: number
  label: string
  color: string
}

export interface BeatGrid {
  /** seconds from track start to the grid's own beat 0, folded into [0, 60/bpm) */
  offsetSec: number
  bpm: number
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
  /**
   * Detected/edited beat grid (v0.3.0) — phase (`offsetSec`) plus the same
   * number as `bpm`, always written together. `null` until a track is loaded
   * or detection found nothing to say (too short/quiet to show a periodicity).
   */
  beatGrid: BeatGrid | null
  /**
   * Whether `beatGrid` has been checked or edited by the user. False means
   * detection found it but wasn't confident, or found nothing at all — shown
   * in the UI, never silently trusted. `true` with no track loaded (nothing
   * to warn about).
   */
  beatGridConfirmed: boolean
  /** locked to the master deck's phase via SYNC (v0.3.0) */
  syncActive: boolean
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
