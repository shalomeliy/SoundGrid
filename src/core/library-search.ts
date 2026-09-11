import type { Track } from '@/core/types'

/**
 * The library's free-text filter, extended with a BPM range (v0.8.0). A
 * plain query keeps matching exactly what `Library.tsx`'s search box
 * already matched (path/artist/title/genre substring) plus an exact key
 * match, so nothing that filtered before stops filtering now.
 *
 * `120-130` is read as a BPM range. A reversed range (`130-120`) or a
 * non-numeric one is not an error — the query just falls through to the
 * plain-text match below, same as any other string that happens to
 * contain a dash. Never a blocked or silently-empty result.
 */
export function matchesQuery(track: Track, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true

  const range = parseBpmRange(q)
  if (range) return track.bpm != null && track.bpm >= range.min && track.bpm <= range.max

  return (
    track.path.toLowerCase().includes(q) ||
    (track.artist?.toLowerCase().includes(q) ?? false) ||
    (track.title?.toLowerCase().includes(q) ?? false) ||
    (track.genre?.toLowerCase().includes(q) ?? false) ||
    track.key?.toLowerCase() === q ||
    track.camelot?.toLowerCase() === q
  )
}

export interface BpmRange {
  min: number
  max: number
}

/** `null` for anything that isn't a valid, non-reversed numeric range — the caller falls back to text matching, it never treats this as an error. */
export function parseBpmRange(q: string): BpmRange | null {
  const m = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(q.trim())
  if (!m) return null
  const min = Number(m[1])
  const max = Number(m[2])
  if (!isFinite(min) || !isFinite(max) || min > max) return null
  return { min, max }
}
