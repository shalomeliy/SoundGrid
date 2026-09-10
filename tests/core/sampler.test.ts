import { describe, expect, it } from 'vitest'
import { emptySamplerSlot, isSamplerMode, samplerSyncRate, SAMPLER_SLOT_COUNT } from '@/core/sampler'

describe('samplerSyncRate', () => {
  it('is 1 when sync is off, regardless of BPMs', () => {
    expect(samplerSyncRate(140, 70, false)).toBe(1)
  })

  it('is 1 when the master has no BPM yet', () => {
    expect(samplerSyncRate(null, 128, true)).toBe(1)
  })

  it('is 1 when the slot has no BPM (unknown, never guessed)', () => {
    expect(samplerSyncRate(140, undefined, true)).toBe(1)
  })

  it('scales to the master when both BPMs are known', () => {
    expect(samplerSyncRate(140, 70, true)).toBeCloseTo(2)
    expect(samplerSyncRate(128, 128, true)).toBeCloseTo(1)
    expect(samplerSyncRate(96, 128, true)).toBeCloseTo(0.75)
  })

  it('falls back to 1 rather than a zero/negative/absurd rate', () => {
    expect(samplerSyncRate(140, 0, true)).toBe(1)
    expect(samplerSyncRate(0, 128, true)).toBe(1)
  })
})

describe('emptySamplerSlot', () => {
  it('has no track and is not mid-playback', () => {
    const s = emptySamplerSlot()
    expect(s.trackId).toBeNull()
    expect(s.contentHash).toBeUndefined()
    expect(s.playing).toBe(false)
    expect(s.mode).toBe('oneShot')
  })
})

describe('SAMPLER_SLOT_COUNT', () => {
  it('is 16 — 8 pads x the existing SHIFT layer (v0.5.0)', () => {
    expect(SAMPLER_SLOT_COUNT).toBe(16)
  })
})

describe('isSamplerMode', () => {
  it('accepts exactly the three known modes', () => {
    expect(isSamplerMode('oneShot')).toBe(true)
    expect(isSamplerMode('loop')).toBe(true)
    expect(isSamplerMode('gated')).toBe(true)
  })

  it('rejects anything else — a hand-edited/corrupted import must not slip through', () => {
    expect(isSamplerMode('one-shot')).toBe(false)
    expect(isSamplerMode('')).toBe(false)
    expect(isSamplerMode(undefined)).toBe(false)
    expect(isSamplerMode(3)).toBe(false)
  })
})
