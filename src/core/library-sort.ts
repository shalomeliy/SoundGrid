import type { Track } from '@/core/types'

/**
 * Sortable library columns (v0.8.0). `key` sorts by the Camelot wheel
 * position, not the displayed string — the display alternates between
 * musical and Camelot spelling (`keyMode`, `Library.tsx`), but the wheel
 * order is the one ordering that means the same thing in either mode.
 */
export type SortKey = 'title' | 'artist' | 'bpm' | 'key' | 'durationSec' | 'note' | 'lastPlayedAt'
export type SortDir = 'asc' | 'desc'

/** `8A` -> 16, `8B` -> 17 — wheel position first, then major/minor. `undefined` for anything that doesn't parse, same "goes last" treatment as a missing BPM. */
function camelotOrder(camelot: string | undefined): number | undefined {
  const m = camelot ? /^(\d{1,2})([AB])$/.exec(camelot) : null
  if (!m) return undefined
  return Number(m[1]) * 2 + (m[2] === 'B' ? 1 : 0)
}

function sortValue(t: Track, key: SortKey): string | number | undefined {
  switch (key) {
    case 'title':
      return (t.title ?? t.name).toLowerCase()
    case 'artist':
      return t.artist?.toLowerCase()
    case 'bpm':
      return t.bpm
    case 'key':
      return camelotOrder(t.camelot)
    case 'durationSec':
      return t.durationSec
    case 'note':
      return t.note?.toLowerCase()
    case 'lastPlayedAt':
      return t.lastPlayedAt
  }
}

/**
 * `sortKey === null` returns `tracks` unchanged (scan order, today's
 * behaviour). A track missing the sorted value always sorts last, in
 * *both* directions — a track with no BPM is not "the fastest" just
 * because the column is sorted descending.
 */
export function sortTracks(tracks: Track[], sortKey: SortKey | null, sortDir: SortDir): Track[] {
  if (!sortKey) return tracks
  const dir = sortDir === 'asc' ? 1 : -1
  return [...tracks].sort((a, b) => {
    const av = sortValue(a, sortKey)
    const bv = sortValue(b, sortKey)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
}
