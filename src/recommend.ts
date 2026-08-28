import { TEMPO_RANGE } from './audio/constants'
import type { DeckId, Track } from './types'

export interface MixMatch {
  /** true = tight match (bold + dot); false = loose match (dot only) */
  strong: boolean
  /** which playing deck it mixes with, for the dot colour */
  deck: DeckId
}

/** Just what the recommender needs from a deck — keeps it off per-frame state. */
export interface DeckMixState {
  id: DeckId
  playing: boolean
  bpm: number | null
  tempo: number
  trackId: string | null
}

/**
 * Which library tracks mix well with whatever is currently playing.
 *
 * v0.1.5 basic version: BPM proximity only, allowing half/double-time.
 * Key/energy come with real key detection in v0.9 (see ROADMAP v0.4.5).
 */
export function mixRecommendations(
  decks: DeckMixState[],
  tracks: Track[],
): Map<string, MixMatch> {
  const refs = decks
    .filter((d) => d.playing && d.bpm != null && d.trackId)
    .map((d) => ({
      deck: d.id,
      bpm: d.bpm! * (1 + d.tempo * TEMPO_RANGE),
      trackId: d.trackId!,
    }))

  const out = new Map<string, MixMatch>()
  if (refs.length === 0) return out

  const onDeck = new Set(refs.map((r) => r.trackId))
  for (const t of tracks) {
    if (t.bpm == null || onDeck.has(t.id)) continue
    let bestErr = Infinity
    let bestDeck: 'A' | 'B' = refs[0].deck
    for (const ref of refs) {
      for (const mult of [0.5, 1, 2]) {
        const err = Math.abs(t.bpm * mult - ref.bpm) / ref.bpm
        if (err < bestErr) {
          bestErr = err
          bestDeck = ref.deck
        }
      }
    }
    if (bestErr <= 0.08) out.set(t.id, { strong: bestErr <= 0.03, deck: bestDeck })
  }
  return out
}
