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
