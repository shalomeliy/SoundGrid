import { TEMPO_RANGE } from './audio/constants'
import type { DeckId, Track } from './types'

export interface MixMatch {
  /** true = tight match (bold + dot); false = loose match (dot only) */
  strong: boolean
  /** which playing deck it mixes with, for the dot colour */
  deck: DeckId
  /** the keys are harmonically compatible — only set when both are known */
  keyMatch?: boolean
}

/** Just what the recommender needs from a deck — keeps it off per-frame state. */
export interface DeckMixState {
  id: DeckId
  playing: boolean
  bpm: number | null
  tempo: number
  trackId: string | null
  /** Camelot code of the loaded track, when its tags carried a key */
  camelot?: string | null
}

/** Camelot neighbours: same code, ±1 on the wheel, or the relative major/minor. */
export function keysCompatible(a: string, b: string): boolean {
  if (a === b) return true
  const pa = /^(\d{1,2})([AB])$/.exec(a)
  const pb = /^(\d{1,2})([AB])$/.exec(b)
  if (!pa || !pb) return false
  const na = Number(pa[1])
  const nb = Number(pb[1])
  if (pa[2] === pb[2]) {
    const step = Math.abs(na - nb)
    return step === 1 || step === 11 // 12 → 1 wraps
  }
  return na === nb // relative major/minor
}

/**
 * Which library tracks mix well with whatever is currently playing.
 *
 * BPM proximity (allowing half/double-time) gates the match; when both tracks
 * carry a key — tags give us one for most of the library since v0.1.7 —
 * harmonic compatibility decides whether it's a strong match or a loose one.
 * Never excluded on key alone: a clashing key is still a mixable tempo.
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
      camelot: d.camelot ?? null,
    }))

  const out = new Map<string, MixMatch>()
  if (refs.length === 0) return out

  const onDeck = new Set(refs.map((r) => r.trackId))
  for (const t of tracks) {
    if (t.bpm == null || onDeck.has(t.id)) continue
    let bestErr = Infinity
    let best = refs[0]
    for (const ref of refs) {
      for (const mult of [0.5, 1, 2]) {
        const err = Math.abs(t.bpm * mult - ref.bpm) / ref.bpm
        if (err < bestErr) {
          bestErr = err
          best = ref
        }
      }
    }
    if (bestErr > 0.08) continue

    const bothKeyed = best.camelot != null && t.camelot != null
    const keyMatch = bothKeyed ? keysCompatible(best.camelot!, t.camelot!) : undefined
    // with keys known, a clash demotes an otherwise tight tempo match to loose
    const strong = bestErr <= 0.03 && keyMatch !== false
    out.set(t.id, { strong, deck: best.deck, keyMatch })
  }
  return out
}
