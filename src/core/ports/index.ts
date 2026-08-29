/**
 * The platform seams. `core/` and `app/` depend on these interfaces;
 * `platform/` provides the implementations. See
 * `docs/architecture/directions.md` for why each one exists.
 */
export type { AudioBackend, DeckBackend, DecodedAudio, AudioOutput, SetOutputResult } from './audio'
export type { TrackSource, ScanProgress } from './source'
export type { ControlTransport, TransportStatus, TransportDevice } from './transport'
export type { Analyzer, AnalysisCache, TrackAnalysis, WaveformData } from './analyzer'
export type { Clock, Cancel } from './clock'
export type { Persistence } from './persistence'
export type { Capabilities } from './capabilities'
export type { AIProvider, AISuggestion } from './ai'
