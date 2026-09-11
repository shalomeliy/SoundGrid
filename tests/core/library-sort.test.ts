import { describe, expect, it } from 'vitest'
import { sortTracks } from '@/core/library-sort'
import type { Track } from '@/core/types'

const track = (id: string, over: Partial<Track> = {}): Track =>
  ({
    id,
    name: id,
    path: id,
    kind: 'audio/mpeg',
    handle: {} as FileSystemFileHandle,
    ...over,
  }) as Track

describe('sortTracks', () => {
  it('returns the input order unchanged when sortKey is null', () => {
    const tracks = [track('b'), track('a'), track('c')]
    expect(sortTracks(tracks, null, 'asc')).toEqual(tracks)
  })

  it('sorts ascending by bpm', () => {
    const tracks = [track('a', { bpm: 128 }), track('b', { bpm: 100 }), track('c', { bpm: 140 })]
    expect(sortTracks(tracks, 'bpm', 'asc').map((t) => t.id)).toEqual(['b', 'a', 'c'])
  })

  it('sorts descending by bpm', () => {
    const tracks = [track('a', { bpm: 128 }), track('b', { bpm: 100 }), track('c', { bpm: 140 })]
    expect(sortTracks(tracks, 'bpm', 'desc').map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  /** A track missing the sorted value is not "the fastest" just because the column reversed. */
  it('puts a missing bpm last in both directions', () => {
    const tracks = [track('has', { bpm: 120 }), track('missing')]
    expect(sortTracks(tracks, 'bpm', 'asc').map((t) => t.id)).toEqual(['has', 'missing'])
    expect(sortTracks(tracks, 'bpm', 'desc').map((t) => t.id)).toEqual(['has', 'missing'])
  })

  it('sorts key by Camelot wheel position, independent of display spelling', () => {
    const tracks = [track('a', { camelot: '9A' }), track('b', { camelot: '2A' }), track('c', { camelot: '2B' })]
    expect(sortTracks(tracks, 'key', 'asc').map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('puts an unparsable camelot code last, same as a missing one', () => {
    const tracks = [track('has', { camelot: '5A' }), track('garbled', { camelot: 'nope' })]
    expect(sortTracks(tracks, 'key', 'asc').map((t) => t.id)).toEqual(['has', 'garbled'])
  })

  it('sorts title case-insensitively, falling back to name', () => {
    const tracks = [track('a', { title: 'zeta' }), track('b', { name: 'alpha' })]
    expect(sortTracks(tracks, 'title', 'asc').map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('sorts note and lastPlayedAt too, missing values last', () => {
    const tracks = [track('a', { note: 'zzz' }), track('b', { note: 'aaa' }), track('c')]
    expect(sortTracks(tracks, 'note', 'asc').map((t) => t.id)).toEqual(['b', 'a', 'c'])

    const played = [track('old', { lastPlayedAt: 100 }), track('new', { lastPlayedAt: 200 }), track('never')]
    expect(sortTracks(played, 'lastPlayedAt', 'desc').map((t) => t.id)).toEqual(['new', 'old', 'never'])
  })

  it('does not mutate the input array', () => {
    const tracks = [track('b', { bpm: 2 }), track('a', { bpm: 1 })]
    const original = [...tracks]
    sortTracks(tracks, 'bpm', 'asc')
    expect(tracks).toEqual(original)
  })
})
