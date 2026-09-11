/**
 * File System Access writer for v0.7.5's master recording — the first thing
 * this app writes to the user's own disk. Every prior write in the codebase
 * (`sampler-idb/store.ts`'s bank export, `tags.ts`) either goes to
 * IndexedDB or reads only; this writes bytes into a NEW file the owner
 * picks in a save dialog, never an existing file of theirs — the carve-out
 * `CLAUDE.md`/`CLAUDE-HE.md` record next to "read the user's files, never
 * write to them".
 *
 * Same `AbortError` shape as `sampler-idb/store.ts`'s
 * `exportSamplerBankToFile`: the owner closing the dialog is `'cancelled'`,
 * a normal outcome — not something `controls.ts` turns into a notice.
 */
const WAV_FILE_TYPES = [{ description: 'WAV audio', accept: { 'audio/wav': ['.wav'] } }]

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

function getSaveFilePicker(): ((o?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>) | undefined {
  return (window as unknown as { showSaveFilePicker?: (o?: SaveFilePickerOptions) => Promise<FileSystemFileHandle> })
    .showSaveFilePicker
}

export async function saveMasterRecording(
  bytes: Uint8Array,
  suggestedName: string,
): Promise<'ok' | 'cancelled'> {
  const picker = getSaveFilePicker()
  if (typeof picker !== 'function') throw new Error('this browser has no file save dialog')
  let handle: FileSystemFileHandle
  try {
    handle = await picker({ suggestedName, types: WAV_FILE_TYPES })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    throw err
  }
  const writable = await handle.createWritable()
  // `Uint8Array`'s DOM type is generic over `ArrayBufferLike` (which
  // includes `SharedArrayBuffer`), stricter than `FileSystemWriteChunkType`
  // allows — `core/wav.ts` always backs this with a plain `ArrayBuffer`, so
  // the cast is safe, not a way around a real type mismatch.
  await writable.write(bytes as unknown as BufferSource)
  await writable.close()
  return 'ok'
}

interface DirectoryPickerOptions {
  mode?: 'read' | 'readwrite'
}

function getDirectoryPicker(): ((o?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>) | undefined {
  return (window as unknown as { showDirectoryPicker?: (o?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker
}

/**
 * Split-by-track export (v0.7.5): a folder the owner picks, one WAV per
 * segment plus a plain-text cue sheet naming them — `core/recording.ts`'s
 * `segmentFileNames`/`buildCueSheet` are the single source of truth for
 * those file names, so the sheet can never point at a name this didn't
 * actually write.
 */
export async function saveSplitMasterRecording(
  files: { name: string; bytes: Uint8Array }[],
  cueSheetText: string,
): Promise<'ok' | 'cancelled'> {
  const picker = getDirectoryPicker()
  if (typeof picker !== 'function') throw new Error('this browser has no folder save dialog')
  let dir: FileSystemDirectoryHandle
  try {
    dir = await picker({ mode: 'readwrite' })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    throw err
  }
  for (const f of files) {
    const handle = await dir.getFileHandle(f.name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(f.bytes as unknown as BufferSource)
    await writable.close()
  }
  const cueHandle = await dir.getFileHandle('cue-sheet.txt', { create: true })
  const cueWritable = await cueHandle.createWritable()
  await cueWritable.write(cueSheetText)
  await cueWritable.close()
  return 'ok'
}
