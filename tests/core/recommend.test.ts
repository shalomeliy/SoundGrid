import { describe, expect, it } from 'vitest'
import { keysCompatible, mixRecommendations, type DeckMixState } from '@/core/recommend'
import type { Track } from '@/core/types'

/** Nothing here reads `handle` — it exists only to satisfy `Track`. */
const track = (id: string, bpm?: number, camelot?: string): Track =>
  ({
    id,
    name: id,
    path: id,
    kind: 'audio/mpeg',
    handle: {} as FileSystemFileHandle,
    bpm,
    camelot,
  }) as Track

const deck = (id: 'A' | 'B', over: Partial<DeckMixState> = {}): DeckMixState => ({
  id,
  playing: true,
  bpm: 128,
  tempo: 0,
  trackId: 'onDeck',
  camelot: null,
  ...over,
})

describe('keysCompatible', () => {
  it('the same code is compatible', () => {
    expect(keysCompatible('8A', '8A')).toBe(true)
  })

  it('one step up the wheel is compatible', () => {
    expect(keysCompatible('8A', '9A')).toBe(true)
  })

  it('one step down the wheel is compatible', () => {
    expect(keysCompatible('8A', '7A')).toBe(true)
  })

  it('wraps from 12 to 1', () => {
    // step === 11, the wrap case the plain |na - nb| === 1 check would miss.
    expect(keysCompatible('12A', '1A')).toBe(true)
  })

  it('the relative major/minor (same number, other letter) is compatible', () => {
    expect(keysCompatible('8A', '8B')).toBe(true)
  })

  it('two steps away on the same letter is not compatible', () => {
    expect(keysCompatible('8A', '10A')).toBe(false)
  })

  it('a mismatched number and letter is not compatible', () => {
    expect(keysCompatible('8A', '3B')).toBe(false)
  })

  it('malformed input returns false rather than throwing', () => {
    expect(keysCompatible('8', 'garbage')).toBe(false)
    expect(keysCompatible('', '8A')).toBe(false)
  })

  it('is case-sensitive — a lowercase letter never matches, on purpose', () => {
    // Pinned so a future "helpfully" lowercased tag fails loudly instead of
    // quietly stopping (or starting) to match.
    expect(keysCompatible('8a', '8A')).toBe(false)
  })
})

describe('mixRecommendations', () => {
  it('matches a track already at the deck tempo (1x)', () => {
    const recs = mixRecommendations([deck('A', { bpm: 128 })], [track('t', 128)])
    expect(recs.get('t')?.strong).toBe(true)
  })

  it('matches a track at half the deck tempo (0.5x, half-time)', () => {
    const recs = mixRecommendations([deck('A', { bpm: 128 })], [track('t', 64)])
    expect(recs.has('t')).toBe(true)
  })

  it('matches a track at double the deck tempo (2x, double-time)', () => {
    const recs = mixRecommendations([deck('A', { bpm: 128 })], [track('t', 256)])
    expect(recs.has('t')).toBe(true)
  })

  it('exactly 3% error is still a strong match (inclusive boundary)', () => {
    const recs = mixRecommendations([deck('A', { bpm: 100 })], [track('t', 103)])
    expect(recs.get('t')?.strong).toBe(true)
  })

  it('exactly 8% error is included but not strong', () => {
    const recs = mixRecommendations([deck('A', { bpm: 100 })], [track('t', 108)])
    const m = recs.get('t')
    expect(m).toBeDefined()
    expect(m?.strong).toBe(false)
  })

  it('just over 8% error is excluded entirely', () => {
    const recs = mixRecommendations([deck('A', { bpm: 100 })], [track('t', 108.1)])
    expect(recs.has('t')).toBe(false)
  })

  it('both keys unknown is still a strong match — key alone never excludes', () => {
    const recs = mixRecommendations([deck('A', { bpm: 128, camelot: null })], [track('t', 128)])
    const m = recs.get('t')
    expect(m?.strong).toBe(true)
    expect(m?.keyMatch).toBeUndefined()
  })

  it('a clashing key demotes an otherwise-tight tempo match to loose', () => {
    const recs = mixRecommendations(
      [deck('A', { bpm: 128, camelot: '8A' })],
      [track('t', 128, '3B')],
    )
    const m = recs.get('t')
    expect(m?.strong).toBe(false)
    expect(m?.keyMatch).toBe(false)
  })

  it('a track already loaded on a deck is excluded from its own recommendations', () => {
    const recs = mixRecommendations(
      [deck('A', { bpm: 128, trackId: 'onDeck' })],
      [track('onDeck', 128)],
    )
    expect(recs.has('onDeck')).toBe(false)
  })

  it('a track with no BPM is excluded', () => {
    const recs = mixRecommendations([deck('A', { bpm: 128 })], [track('t', undefined)])
    expect(recs.has('t')).toBe(false)
  })

  it('a deck that is not playing is never used as a reference', () => {
    const recs = mixRecommendations([deck('A', { bpm: 128, playing: false })], [track('t', 128)])
    expect(recs.has('t')).toBe(false)
  })

  it('a playing deck with no BPM is never used as a reference', () => {
    const recs = mixRecommendations([deck('A', { bpm: null })], [track('t', 128)])
    expect(recs.has('t')).toBe(false)
  })

  it('an empty deck list returns an empty map', () => {
    expect(mixRecommendations([], [track('t', 128)]).size).toBe(0)
  })

  it('an empty track list returns an empty map', () => {
    expect(mixRecommendations([deck('A')], []).size).toBe(0)
  })

  it('the tempo fader shifts the reference BPM before matching', () => {
    // TEMPO_RANGE = 0.08, so tempo=0.5 lifts a 120 BPM deck to 124.8 effective.
    const decks = [deck('A', { bpm: 120, tempo: 0.5, trackId: 'onDeck' })]
    const atShiftedBpm = mixRecommendations(decks, [track('shifted', 124.8)])
    expect(atShiftedBpm.get('shifted')?.strong).toBe(true)
    const atUnshiftedBpm = mixRecommendations(decks, [track('unshifted', 120)])
    // 120 vs effective 124.8 is a ~3.85% error — matches, but not strong.
    expect(atUnshiftedBpm.get('unshifted')?.strong).toBe(false)
  })

  it('two decks tie exactly on tempo error — the key-compatible one wins', () => {
    // The regression this version fixes: both decks at 128 BPM, track at 128.
    // Deck A's key clashes, deck B's is compatible — B must win, not "A" by
    // array order.
    const recs = mixRecommendations(
      [
        deck('A', { bpm: 128, camelot: '2A', trackId: 'onA' }),
        deck('B', { bpm: 128, camelot: '9A', trackId: 'onB' }),
      ],
      [track('t', 128, '8A')],
    )
    expect(recs.get('t')?.deck).toBe('B')
  })

  it('a tie between equally-compatible decks falls back to array order', () => {
    // Proves the fix doesn't overcorrect into always preferring deck B.
    const recs = mixRecommendations(
      [
        deck('A', { bpm: 128, camelot: '8A', trackId: 'onA' }),
        deck('B', { bpm: 128, camelot: '9A', trackId: 'onB' }),
      ],
      [track('t', 128, '8A')],
    )
    expect(recs.get('t')?.deck).toBe('A')
  })
})
