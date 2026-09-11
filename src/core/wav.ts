/**
 * WAV (PCM) encoding, pure. No `AudioContext`, no DOM — same split as
 * `core/scratch.ts`/`core/fx.ts`. Written for v0.7.5's recording: WAV is a
 * 44-byte header in front of raw samples, not a codec, so no encoder
 * (external or `AudioWorklet`) is needed to produce one — see
 * `docs/architecture/directions.md`/`ROADMAP.md`'s v0.7.5 note on why WAV
 * shipped before any compressed format.
 */

const BYTES_PER_SAMPLE_16 = 2

/** One de-interleaved channel buffer per channel, all the same length. */
export function interleave(channels: Float32Array[]): Float32Array {
  const numChannels = channels.length
  const frames = channels[0]?.length ?? 0
  const out = new Float32Array(frames * numChannels)
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      out[i * numChannels + c] = channels[c][i]
    }
  }
  return out
}

/**
 * Clamped to [-1, 1] before scaling — a hot signal (post-limiter it should
 * never be, but this function doesn't know that) must wrap to silence
 * instead of aliasing into the opposite sign, which is what an unclamped
 * `* 0x7fff` does on an Int16Array.
 */
export function floatTo16BitPCM(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** Canonical 44-byte PCM WAV header for `dataBytesLen` bytes of `bitsPerSample`-bit samples. */
export function buildWavHeader(
  dataBytesLen: number,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): Uint8Array {
  const blockAlign = numChannels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  const buf = new ArrayBuffer(44)
  const v = new DataView(buf)
  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + dataBytesLen, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true) // fmt chunk size (PCM)
  v.setUint16(20, 1, true) // audio format: 1 = PCM
  v.setUint16(22, numChannels, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, byteRate, true)
  v.setUint16(32, blockAlign, true)
  v.setUint16(34, bitsPerSample, true)
  str(36, 'data')
  v.setUint32(40, dataBytesLen, true)
  return new Uint8Array(buf)
}

/** Full WAV file bytes (header + 16-bit PCM data) from de-interleaved float channels. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const numChannels = channels.length
  const pcm = floatTo16BitPCM(interleave(channels))
  const dataBytes = pcm.length * BYTES_PER_SAMPLE_16
  const header = buildWavHeader(dataBytes, sampleRate, numChannels, 16)
  const out = new Uint8Array(header.length + dataBytes)
  out.set(header, 0)
  out.set(new Uint8Array(pcm.buffer, pcm.byteOffset, dataBytes), header.length)
  return out
}
