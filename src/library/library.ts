import { get, set } from 'idb-keyval'
import type { Track } from '../types'
import { readTags } from './tags'

const HANDLE_KEY = 'soundgrid:libraryDir'

/**
 * Everything Chromium's `decodeAudioData` can actually play. Kept as an
 * allowlist rather than "try to decode anything" because a music folder is full
 * of things that are not tracks — artwork, playlists, and the stem caches
 * below — and a library that lists them is worse than one that misses a format.
 */
const AUDIO_EXT = new Set([
  'mp3',
  'wav',
  'flac',
  'm4a',
  'm4b',
  'mp4',
  'aac',
  'ogg',
  'oga',
  'opus',
  'weba',
  'webm',
  'aiff',
  'aif',
])

/**
 * Companion files that sit next to a real track and must never become rows of
 * their own. `.serato-stems` is Serato's stem-separation cache: every one of
 * them has a playable source file alongside it, so listing them would show
 * those songs twice.
 */
const COMPANION_EXT = new Set(['serato-stems', 'asd', 'reapeaks', 'ovw'])

export interface LibraryFolder {
  handle: FileSystemDirectoryHandle
  name: string
}

export function fileSystemAccessSupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown })
    .showDirectoryPicker === 'function'
}

export async function pickLibraryFolder(): Promise<LibraryFolder | null> {
  const picker = (
    window as unknown as {
      showDirectoryPicker: (o?: {
        mode?: 'read' | 'readwrite'
        id?: string
      }) => Promise<FileSystemDirectoryHandle>
    }
  ).showDirectoryPicker
  try {
    const handle = await picker({ mode: 'read', id: 'soundgrid-music' })
    await set(HANDLE_KEY, handle)
    return { handle, name: handle.name }
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return null
    throw err
  }
}

export async function restoreLibraryFolder(): Promise<LibraryFolder | null> {
  const handle = await get<FileSystemDirectoryHandle>(HANDLE_KEY)
  if (!handle) return null
  const perm = await handle.queryPermission({ mode: 'read' })
  if (perm === 'granted') return { handle, name: handle.name }
  return { handle, name: handle.name } // caller must re-request on user gesture
}

export async function ensureReadPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') return true
  return (await handle.requestPermission({ mode: 'read' })) === 'granted'
}

export interface ScanProgress {
  found: number
  currentDir: string
}

export interface ScanResult {
  tracks: Track[]
  /** files we walked past, by extension — surfaced so a skip is never silent */
  skipped: Record<string, number>
}

/** Recursively walk the folder collecting audio files. */
export async function scanLibrary(
  root: FileSystemDirectoryHandle,
  onProgress?: (p: ScanProgress) => void,
): Promise<ScanResult> {
  const out: Track[] = []
  const skipped: Record<string, number> = {}
  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    onProgress?.({ found: out.length, currentDir: prefix || '/' })
    for await (const [name, entry] of dir.entries()) {
      if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, `${prefix}${name}/`)
      } else {
        const ext = name.split('.').pop()?.toLowerCase() ?? ''
        if (!AUDIO_EXT.has(ext)) {
          // companions are expected and uninteresting; anything else is a file
          // the user may well think of as a track, so it gets counted and shown
          if (!COMPANION_EXT.has(ext) && !name.startsWith('.')) {
            skipped[ext || '(no extension)'] = (skipped[ext || '(no extension)'] ?? 0) + 1
          }
          continue
        }
        out.push({
          id: `${prefix}${name}`,
          name: name.replace(/\.[^.]+$/, ''),
          path: `${prefix}${name}`,
          kind: ext,
          handle: entry as FileSystemFileHandle,
        })
      }
    }
  }
  await walk(root, '')
  out.sort((a, b) => a.path.localeCompare(b.path))
  return { tracks: out, skipped }
}

export async function readTrackData(track: Track): Promise<ArrayBuffer> {
  const file = await track.handle.getFile()
  return await file.arrayBuffer()
}

export interface TagProgress {
  /** tracks whose tags have been read so far */
  done: number
  total: number
  /** how many of them actually carried a BPM */
  tagged: number
}

/**
 * Second scan pass: read BPM/key/artist from the file headers (v0.1.7).
 *
 * Runs after `scanLibrary` so the list appears immediately and fills in — the
 * reads are byte ranges, not decodes, but a few hundred files still take a
 * moment. Results arrive in batches so the table isn't rebuilt per file.
 * Existing values win: anything the analysis engine wrote stays.
 */
export async function readLibraryTags(
  tracks: Track[],
  onBatch: (patch: Map<string, Partial<Track>>, progress: TagProgress) => void,
  opts: { concurrency?: number; signal?: { cancelled: boolean } } = {},
): Promise<void> {
  const concurrency = opts.concurrency ?? 8
  const total = tracks.length
  let next = 0
  let done = 0
  let tagged = 0
  let batch = new Map<string, Partial<Track>>()
  let lastFlush = performance.now()

  const flush = () => {
    if (batch.size === 0) return
    onBatch(batch, { done, total, tagged })
    batch = new Map()
    lastFlush = performance.now()
  }

  async function worker() {
    while (next < total) {
      if (opts.signal?.cancelled) return
      const track = tracks[next++]
      try {
        const file = await track.handle.getFile()
        const tags = await readTags(file)
        if (tags.bpm != null) tagged++
        const patch: Partial<Track> = {}
        if (tags.bpm != null) patch.bpm = tags.bpm
        if (tags.durationSec != null) patch.durationSec = tags.durationSec
        if (tags.key) patch.key = tags.key
        if (tags.camelot) patch.camelot = tags.camelot
        if (tags.artist) patch.artist = tags.artist
        if (tags.title) patch.title = tags.title
        if (tags.album) patch.album = tags.album
        if (Object.keys(patch).length > 0) batch.set(track.id, patch)
      } catch {
        // permission revoked or file vanished mid-scan — skip it
      }
      done++
      if (batch.size >= 50 || performance.now() - lastFlush > 400) flush()
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker))
  flush()
  if (!opts.signal?.cancelled) onBatch(new Map(), { done, total, tagged })
}
