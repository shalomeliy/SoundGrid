import { TEMPO_RANGE } from '@/core/constants'
import type { DeckId, Track } from '@/core/types'

export interface MixMatch {
  /** true = tight match (bold + dot); false = loose match (dot only) */
  strong: boolean
  /** which playing deck it mixes with, for the dot colour */
  deck: DeckId
  /** the keys are harmonically compatible — only set when both are known */
  keyMatch?: boolean
  /** which multiplier won: 0.5/2 mean the candidate's own tempo is half/double the reference's */
  multiplier: 0.5 | 1 | 2
  /** the playing deck's effective (tempo-adjusted) bpm, for display only */
  refBpm: number
  /** the candidate track's own tagged bpm, for display only */
  trackBpm: number
}

/** Why `mixRecommendations` found nothing — so the UI can say so instead of rendering empty. */
export type NoMatchReason = 'no-bpm-on-playing-deck' | 'none-in-range'

export interface MixRecommendations {
  matches: Map<string, MixMatch>
  /** tracks excluded from consideration for carrying no BPM tag at all */
  noBpmSkipped: number
  /** set only when `matches` is empty */
  reason?: NoMatchReason
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
): MixRecommendations {
  const anyPlaying = decks.some((d) => d.playing)
  const refs = decks
    .filter((d) => d.playing && d.bpm != null && d.trackId)
    .map((d) => ({
      deck: d.id,
      bpm: d.bpm! * (1 + d.tempo * TEMPO_RANGE),
      trackId: d.trackId!,
      camelot: d.camelot ?? null,
    }))

  const matches = new Map<string, MixMatch>()
  if (refs.length === 0) {
    return {
      matches,
      noBpmSkipped: 0,
      reason: anyPlaying ? 'no-bpm-on-playing-deck' : undefined,
    }
  }

  const onDeck = new Set(refs.map((r) => r.trackId))
  let noBpmSkipped = 0
  for (const t of tracks) {
    if (onDeck.has(t.id)) continue
    if (t.bpm == null) {
      noBpmSkipped++
      continue
    }
    let bestErr = Infinity
    let best = refs[0]
    let bestMult: 0.5 | 1 | 2 = 1
    // A tie on tempo error used to fall to array order regardless of which
    // deck actually mixes better — two decks at the same BPM would always
    // highlight for deck A, even when only deck B's key was compatible. An
    // exact tie now yields to the key-compatible side; anything else (a
    // strictly smaller error) still wins outright, as before.
    let bestKeyOk = false
    for (const ref of refs) {
      for (const mult of [0.5, 1, 2] as const) {
        const err = Math.abs(t.bpm * mult - ref.bpm) / ref.bpm
        const keyOk = ref.camelot != null && t.camelot != null && keysCompatible(ref.camelot, t.camelot)
        if (err < bestErr || (err === bestErr && keyOk && !bestKeyOk)) {
          bestErr = err
          best = ref
          bestMult = mult
          bestKeyOk = keyOk
        }
      }
    }
    if (bestErr > 0.08) continue

    const bothKeyed = best.camelot != null && t.camelot != null
    const keyMatch = bothKeyed ? keysCompatible(best.camelot!, t.camelot!) : undefined
    // with keys known, a clash demotes an otherwise tight tempo match to loose
    const strong = bestErr <= 0.03 && keyMatch !== false
    matches.set(t.id, {
      strong,
      deck: best.deck,
      keyMatch,
      multiplier: bestMult,
      refBpm: Math.round(best.bpm),
      trackBpm: Math.round(t.bpm),
    })
  }
  return {
    matches,
    noBpmSkipped,
    reason: matches.size === 0 ? 'none-in-range' : undefined,
  }
}
