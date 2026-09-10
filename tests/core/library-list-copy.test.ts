import { describe, expect, it } from 'vitest'
import { libraryEmptyCopy } from '@/core/library-list-copy'

/**
 * v0.6.0 post-close bug: Mix Assist's `mixOnly` auto-turns-on when a deck
 * starts playing, but nothing turned it back off when playback stopped, and
 * its own toggle button only renders while a deck is playing — so once
 * playback ended there was no control left to undo it. A folder with 43
 * tracks and 34 tagged BPMs rendered "No audio files found", because the
 * empty-state copy only ever checked the text filter, never `mixOnly`.
 */
describe('libraryEmptyCopy', () => {
  it('blames the text filter when it matched nothing, even with mixOnly on', () => {
    const copy = libraryEmptyCopy('trance', true, 0)
    expect(copy.title).toBe('No tracks match that filter')
    expect(copy.offerMixOnlyReset).toBe(false)
  })

  /**
   * A deck is playing (mixOnly on), the query DID match real tracks, but
   * mixOnly hid every one of them. "Clear the filter" would be true but
   * useless here — clearing it alone would not bring anything back, since
   * mixOnly is still filtering what's left. mixOnly must win this case.
   */
  it('blames mixOnly, not the filter, when the filter matched tracks mixOnly then hid', () => {
    const copy = libraryEmptyCopy('trance', true, 5)
    expect(copy.title).not.toBe('No tracks match that filter')
    expect(copy.offerMixOnlyReset).toBe(true)
  })

  /** The exact bug: a real library, no filter text, mixOnly hiding all of it. */
  it('names mixOnly, not a missing folder, when it hid a real library', () => {
    const copy = libraryEmptyCopy('', true, 43)
    expect(copy.title).not.toBe('No audio files found')
    expect(copy.body).toMatch(/mix only/i)
    expect(copy.offerMixOnlyReset).toBe(true)
  })

  it('reports a genuinely empty folder as exactly that', () => {
    const copy = libraryEmptyCopy('', false, 0)
    expect(copy.title).toBe('No audio files found')
    expect(copy.offerMixOnlyReset).toBe(false)
  })

  it('does not blame mixOnly when it never had anything to hide', () => {
    // mixOnly true but the folder itself was already empty before it filtered
    const copy = libraryEmptyCopy('', true, 0)
    expect(copy.title).toBe('No audio files found')
    expect(copy.offerMixOnlyReset).toBe(false)
  })
})
