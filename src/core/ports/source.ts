import type { Track } from '../../types'

/**
 * Where tracks come from. Today: a local folder via File System Access
 * (`platform/source-fsaccess`). Later: a URL, a cloud provider behind OAuth,
 * an offline locker in the Cache API, or stems as their own source (v0.15).
 */
export interface ScanProgress {
  scanned: number
  found: number
}

export interface TrackSource {
  readonly id: string
  readonly available: boolean
  /** user-facing name of the current root, if any */
  readonly rootName: string | null
  pickRoot(): Promise<string | null>
  restoreRoot(): Promise<string | null>
  scan(onProgress?: (p: ScanProgress) => void): Promise<Track[]>
  read(track: Track): Promise<ArrayBuffer>
}
