import { get, set } from 'idb-keyval'
import type { Track } from '../types'

const HANDLE_KEY = 'soundgrid:libraryDir'

const AUDIO_EXT = new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'aiff', 'aif'])

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

/** Recursively walk the folder collecting audio files. */
export async function scanLibrary(
  root: FileSystemDirectoryHandle,
  onProgress?: (p: ScanProgress) => void,
): Promise<Track[]> {
  const out: Track[] = []
  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    onProgress?.({ found: out.length, currentDir: prefix || '/' })
    for await (const [name, entry] of dir.entries()) {
      if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, `${prefix}${name}/`)
      } else {
        const ext = name.split('.').pop()?.toLowerCase() ?? ''
        if (!AUDIO_EXT.has(ext)) continue
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
  return out
}

export async function readTrackData(track: Track): Promise<ArrayBuffer> {
  const file = await track.handle.getFile()
  return await file.arrayBuffer()
}
