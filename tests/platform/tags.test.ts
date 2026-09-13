import { describe, expect, it } from 'vitest'
import { readTags } from '@/platform/source-fsaccess/tags'

/**
 * v0.8.3 debt: `readChunked`'s top-level RIFF/AIFF walk capped at 64 chunks,
 * so an `ID3 ` chunk sitting after that point — real DJ software writes it
 * *after* the audio payload, and other tools can pile filler chunks (cue,
 * bext, LIST, padding) ahead of it — was never reached. A second bug in the
 * same loop made it worse: a single zero-size filler chunk aborted the walk
 * outright, stranding anything after it regardless of the cap.
 */

function u32le(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
}

function chunk(id: string, payload: number[]): number[] {
  const bytes = [...id].map((c) => c.charCodeAt(0))
  const out = [...bytes, ...u32le(payload.length), ...payload]
  if (payload.length & 1) out.push(0) // RIFF pads odd-length chunks
  return out
}

/** Minimal ID3v2.3 tag with a single text frame. */
function id3Tag(frameId: string, value: string): number[] {
  const text = [0, ...[...value].map((c) => c.charCodeAt(0))] // encoding 0 = latin1
  const frame = [...[...frameId].map((c) => c.charCodeAt(0)), ...u32BE(text.length), 0, 0, ...text]
  const size = frame.length
  const header = [0x49, 0x44, 0x33, 3, 0, 0, ...syncsafe(size)] // "ID3", v2.3, flags 0
  return [...header, ...frame]
}
function u32BE(n: number): number[] {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}
function syncsafe(n: number): number[] {
  return [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]
}

function wavFile(fillerChunks: number[][], id3Payload: number[]): File {
  const body = [...fillerChunks.flat(), ...chunk('ID3 ', id3Payload)]
  const riff = [
    ...[...'RIFF'].map((c) => c.charCodeAt(0)),
    ...u32le(4 + body.length),
    ...[...'WAVE'].map((c) => c.charCodeAt(0)),
    ...body,
  ]
  return new File([new Uint8Array(riff)], 'test.wav', { type: 'audio/wav' })
}

describe('readTags — WAV chunk walk', () => {
  it('finds an ID3 tag sitting after the old 64-chunk cap', async () => {
    const filler = Array.from({ length: 100 }, (_, i) => chunk('jnk ', u32le(i)))
    const file = wavFile(filler, id3Tag('TIT2', 'Chunk100'))
    const tags = await readTags(file)
    expect(tags.title).toBe('Chunk100')
  })

  it('does not abort the whole walk on a zero-size filler chunk', async () => {
    const filler = [chunk('jnk ', [])] // zero-length payload
    const file = wavFile(filler, id3Tag('TIT2', 'AfterZeroChunk'))
    const tags = await readTags(file)
    expect(tags.title).toBe('AfterZeroChunk')
  })

  it('still finds a tag with no filler chunks at all (no regression)', async () => {
    const file = wavFile([], id3Tag('TIT2', 'Plain'))
    const tags = await readTags(file)
    expect(tags.title).toBe('Plain')
  })
})
