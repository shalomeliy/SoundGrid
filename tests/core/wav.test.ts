import { describe, expect, it } from 'vitest'
import { buildWavHeader, encodeWav, floatTo16BitPCM, interleave } from '@/core/wav'

describe('interleave', () => {
  it('interleaves two channels sample-by-sample', () => {
    const left = new Float32Array([1, 2, 3])
    const right = new Float32Array([10, 20, 30])
    expect(Array.from(interleave([left, right]))).toEqual([1, 10, 2, 20, 3, 30])
  })

  it('passes a single channel through unchanged', () => {
    const mono = new Float32Array([0.1, 0.2, 0.3])
    const out = Array.from(interleave([mono]))
    expect(out.length).toBe(3)
    out.forEach((v, i) => expect(v).toBeCloseTo([0.1, 0.2, 0.3][i], 6))
  })
})

describe('floatTo16BitPCM', () => {
  it('maps -1..1 to the full Int16 range', () => {
    const out = floatTo16BitPCM(new Float32Array([1, -1, 0]))
    expect(out[0]).toBe(0x7fff)
    expect(out[1]).toBe(-0x8000)
    expect(out[2]).toBe(0)
  })

  it('clamps out-of-range samples instead of wrapping', () => {
    const out = floatTo16BitPCM(new Float32Array([1.5, -1.5]))
    expect(out[0]).toBe(0x7fff)
    expect(out[1]).toBe(-0x8000)
  })
})

describe('buildWavHeader', () => {
  it('produces a canonical 44-byte PCM header', () => {
    const header = buildWavHeader(2000, 44100, 2, 16)
    const v = new DataView(header.buffer, header.byteOffset, header.byteLength)
    expect(header.length).toBe(44)
    expect(String.fromCharCode(...header.slice(0, 4))).toBe('RIFF')
    expect(v.getUint32(4, true)).toBe(36 + 2000) // RIFF chunk size
    expect(String.fromCharCode(...header.slice(8, 12))).toBe('WAVE')
    expect(String.fromCharCode(...header.slice(12, 16))).toBe('fmt ')
    expect(v.getUint32(16, true)).toBe(16) // fmt chunk size
    expect(v.getUint16(20, true)).toBe(1) // PCM
    expect(v.getUint16(22, true)).toBe(2) // channels
    expect(v.getUint32(24, true)).toBe(44100) // sample rate
    expect(v.getUint32(28, true)).toBe(44100 * 2 * 2) // byte rate
    expect(v.getUint16(32, true)).toBe(4) // block align
    expect(v.getUint16(34, true)).toBe(16) // bits per sample
    expect(String.fromCharCode(...header.slice(36, 40))).toBe('data')
    expect(v.getUint32(40, true)).toBe(2000) // data chunk size
  })
})

describe('encodeWav', () => {
  it('round-trips a short known signal through the header and PCM data', () => {
    const left = new Float32Array([0, 1, -1, 0.5])
    const right = new Float32Array([0, -1, 1, -0.5])
    const bytes = encodeWav([left, right], 8000)

    expect(bytes.length).toBe(44 + 4 * 2 * 2) // header + 4 frames * 2 channels * 2 bytes

    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(v.getUint32(24, true)).toBe(8000)
    expect(v.getUint16(22, true)).toBe(2)

    const readSample = (frame: number, channel: number) =>
      v.getInt16(44 + (frame * 2 + channel) * 2, true)
    expect(readSample(0, 0)).toBe(0)
    expect(readSample(1, 0)).toBe(0x7fff)
    expect(readSample(2, 0)).toBe(-0x8000)
    expect(readSample(1, 1)).toBe(-0x8000)
    expect(readSample(2, 1)).toBe(0x7fff)
  })
})
