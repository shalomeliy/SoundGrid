import { describe, expect, it } from 'vitest'
import { matchesQuery, parseBpmRange } from '@/core/library-search'
import type { Track } from '@/core/types'

const track = (over: Partial<Track> = {}): Track =>
  ({
    id: 't',
    name: 'Some Track',
    path: 'Techno/Some Track.mp3',
    kind: 'audio/mpeg',
    handle: {} as FileSystemFileHandle,
    ...over,
  }) as Track

describe('parseBpmRange', () => {
  it('parses a simple range', () => {
    expect(parseBpmRange('120-130')).toEqual({ min: 120, max: 130 })
  })

  it('allows spaces and decimals', () => {
    expect(parseBpmRange('120.5 - 130')).toEqual({ min: 120.5, max: 130 })
  })

  it('rejects a reversed range', () => {
    expect(parseBpmRange('130-120')).toBeNull()
  })

  it('rejects a non-numeric range', () => {
    expect(parseBpmRange('abc-xyz')).toBeNull()
  })

  it('rejects plain text with no dash', () => {
    expect(parseBpmRange('techno')).toBeNull()
  })
})

describe('matchesQuery', () => {
  it('matches everything on an empty query', () => {
    expect(matchesQuery(track(), '')).toBe(true)
    expect(matchesQuery(track(), '   ')).toBe(true)
  })

  it('matches a BPM range against the track bpm', () => {
    expect(matchesQuery(track({ bpm: 125 }), '120-130')).toBe(true)
    expect(matchesQuery(track({ bpm: 118 }), '120-130')).toBe(false)
  })

  it('a track with no bpm never matches a range query', () => {
    expect(matchesQuery(track(), '120-130')).toBe(false)
  })

  /** Same guarantee QA-expert flagged: never blocked, never a hard error. */
  it('falls back to plain text for a reversed or non-numeric range', () => {
    expect(matchesQuery(track({ path: '130-120 remix.mp3' }), '130-120')).toBe(true)
  })

  it('still matches path/artist/title/genre substrings like before', () => {
    expect(matchesQuery(track({ artist: 'DJ Test' }), 'dj test')).toBe(true)
    expect(matchesQuery(track({ title: 'Warehouse' }), 'house')).toBe(true)
    expect(matchesQuery(track({ genre: 'Techno' }), 'techno')).toBe(true)
    expect(matchesQuery(track(), 'techno')).toBe(true) // matches the path fixture
  })

  it('matches an exact key or camelot code, case-insensitively', () => {
    expect(matchesQuery(track({ camelot: '8A' }), '8a')).toBe(true)
    expect(matchesQuery(track({ key: 'Am' }), 'am')).toBe(true)
    expect(matchesQuery(track({ camelot: '8A' }), '9a')).toBe(false)
  })
})
