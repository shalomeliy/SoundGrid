/**
 * Track analysis. Today a plain-JS implementation on the main thread
 * (`platform/analyzer-js`). The point of the seam: v0.4 moves this to a Web
 * Worker with a real cache, and WASM/WebGPU or a remote service can replace it
 * without any caller changing.
 */
export interface WaveformData {
  /** interleaved [min, max] per bucket */
  peaks: Float32Array
  /** low/mid/high RMS per bucket */
  bands: Float32Array
}

export interface TrackAnalysis extends WaveformData {
  bpm: number | null
  durationSec: number
}

export interface Analyzer {
  analyze(audio: ArrayBuffer | unknown, opts?: { knownBpm?: number | null }): Promise<TrackAnalysis>
}

/** Analysis is expensive and deterministic — v0.4 keys this by file hash. */
export interface AnalysisCache {
  get(key: string): Promise<TrackAnalysis | null>
  put(key: string, value: TrackAnalysis): Promise<void>
}
