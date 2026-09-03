import { describe, expect, it } from 'vitest'
import { bytesToHex } from '@/core/hash'

describe('bytesToHex', () => {
  it('formats a known byte sequence as lowercase hex', () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x0f, 0xff, 0xa5])
    expect(bytesToHex(bytes.buffer)).toBe('00010fffa5')
  })

  it('returns an empty string for an empty buffer', () => {
    expect(bytesToHex(new ArrayBuffer(0))).toBe('')
  })

  it('never collides two different byte sequences in this fixed sample set', () => {
    const a = bytesToHex(new Uint8Array([1, 2, 3]).buffer)
    const b = bytesToHex(new Uint8Array([1, 2, 4]).buffer)
    const c = bytesToHex(new Uint8Array([3, 2, 1]).buffer)
    expect(new Set([a, b, c]).size).toBe(3)
  })
})
