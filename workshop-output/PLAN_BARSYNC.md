# PLAN — Live "shift one beat" control (v0.8.8)

Based on `workshop-output/FEATURE_SPEC_BARSYNC.md` (approved 16/09). File-level plan,
not a repeat of product decisions already closed there.

## 1. `core/mapping/mapping.ts` — new `ControlAction`

Add `'beatShift'` to the union (next to `'sync'`). `Binding.param` carries direction:
`1` = forward, `-1` = backward (same "param as small int" idiom `hotcue`/`padMode`
already use).

## 2. `controls.ts` — `shiftDeckByBeat`

New function, placed next to `nudgeDeck`/`bendDeck` (~line 808):

```ts
/**
 * Live bar/downbeat correction (v0.8.8) — jumps the deck by exactly one
 * whole beat (`60 / grid.bpm` seconds), forward or back. Deliberately NOT a
 * BeatGrid edit: phaseDeltaSec's phase math (core/beatgrid.ts) folds to a
 * single beat period, so a whole-beat seek is invisible to it — SYNC stays
 * locked with no special-casing. This is what makes the shift safe: it
 * corrects which beat lines up as "one" without touching why SYNC thinks
 * it's already correct.
 */
export function shiftDeckByBeat(deckId: DeckId, direction: 1 | -1) {
  const deck = engine.decks[deckId]
  if (!deck.hasTrack) return
  const { decks, masterDeckId, setNotice } = useStore.getState()
  const st = decks[deckId]

  if (masterDeckId === deckId) {
    setNotice({
      text: `Deck ${deckId} is the master — shift the other deck instead.`,
      tone: 'warn',
      source: 'sync',
    })
    return
  }
  const grid = st.beatGrid
  if (!grid) {
    setNotice({
      text: `Deck ${deckId} has no beat grid yet — nothing to shift.`,
      tone: 'warn',
      source: 'sync',
    })
    return
  }
  if (st.loopActive) {
    setNotice({
      text: `Deck ${deckId} has an active loop — turn it off before shifting the beat.`,
      tone: 'warn',
      source: 'sync',
    })
    return
  }
  cancelTransitionIfEitherDeckTouched(deckId)
  const beatSec = 60 / grid.bpm
  seekDeck(deckId, deck.position + direction * beatSec)
}
```

`seekDeck` (existing, `controls.ts:582`) reused as-is — same `BufferSourcePlayer.seek`
path CUE-while-playing and the shipped **Beat Jump** pad mode (`pressBeatJumpPad`,
`controls.ts:1177`, live-wired to real pads/MIDI, already does a raw N-beat seek —
including a 1-beat jump, `LOOP_BEATS_STEPS` includes `1` — with no gain ramp) already
go through. `nudgeDeck` (`controls.ts:808`) was the first draft of this citation but
is dead code — split off from MIDI jog in v0.2.0 (`docs/handoff/v0.2.0.md`) and never
re-wired to anything; change-reviewer caught this, Beat Jump is the real live
precedent. **Decision, not an oversight:** no new declick machinery added.
`stopNode()` (`players.ts:191`) already has no gain ramp and every existing seek
caller lives with that; singling this one action out for special declick handling
would touch the shared low-level player for one caller and isn't proven necessary.
If Shalom's real-mix test (verification plan, below) reveals an audible pop, that's
the trigger to revisit — not a guess now.

**Overlap with Beat Jump, noted not silently:** Beat Jump can already do a 1-beat
seek, but only after switching the pad grid into Jump mode (exclusive with Hot Cue/
Loop/Sampler) and has no SYNC-specific guards (master deck, active loop). The new
◂beat/beat▸ control is deliberately a different interaction: always visible right
next to SYNC exactly when relevant, no mode switch mid-transition, with SYNC-aware
guards Beat Jump doesn't need. Two controls reaching the same seek math from
different contexts, not a redundant duplicate — flagged for Shalom, not decided
unilaterally.

## 3. `platform/transport-webmidi/manager.ts` — `dispatch`

One new `case 'beatShift':` calling `ctl.shiftDeckByBeat(binding.deck!, (binding.param ?? 1) as 1 | -1)`,
same shape as the existing `case 'sync':`/`case 'hotcue':` entries.

## 4. `app/components/Deck.tsx` — the buttons

Inside the existing `<div className="relative shrink-0">` BPM block (~line 232-277),
right after the BPM `<button>` and before the `HintIcon`:

```tsx
{deck.syncActive && otherPlaying && (
  <div className="mt-1 flex items-center justify-end gap-1">
    <button
      type="button"
      onClick={() => ctl.shiftDeckByBeat(deckId, -1)}
      title="Beats ticking together but the drums still clash? Tap to bump the track back one whole beat — like nudging a record one click back so the big hits land together."
      className="rounded-[var(--radius-xs)] px-1 py-0.5 text-2xs text-grid-dim transition-colors hover:bg-surface-2 hover:text-grid-text"
    >
      ◂ beat
    </button>
    <button
      type="button"
      onClick={() => ctl.shiftDeckByBeat(deckId, 1)}
      title="Beats ticking together but the drums still clash? Tap to bump the track forward one whole beat — like nudging a record one click ahead so the big hits land together."
      className="rounded-[var(--radius-xs)] px-1 py-0.5 text-2xs text-grid-dim transition-colors hover:bg-surface-2 hover:text-grid-text"
    >
      beat ▸
    </button>
  </div>
)}
```

`otherPlaying` already exists in this component (line 27). `deck.syncActive` already
on `DeckState`. No new selectors needed. Guard clauses inside `shiftDeckByBeat`
itself handle master/no-grid/loop — the button's own visibility condition only
covers "is this even relevant right now" (matches how the existing "♫ N mixable"
toggle in `Library.tsx` only renders while `anyPlaying`).

## 5. `mappings/flx4.ts`

**Not in this pass.** No hardware-confirmed mapping exists yet (matches the
project's own documented debt: "אין בינדינג FLX4 לשישה סטים של פקדים חדשים" —
this becomes the seventh). Mouse-only for v1; bind later via Learn once Shalom
wants it on the controller.

## 6. Tests

`tests/core/` — none needed: `shiftDeckByBeat` lives in `controls.ts` (not `core/`,
touches `engine`/store directly, same reason `nudgeDeck`/`bendDeck` have no unit
tests today). The one pure fact worth pinning — the shift is always an exact whole
beat period — is trivially `60 / bpm`, not complex enough to warrant its own test
separate from the manual verification below.

`scripts/verify-beat-shift.mjs` (new, Playwright, pattern from
`scripts/verify-mix-assist-load.mjs`): two synthetic tracks, both 120 BPM, SYNC
engaged, seed a known phase offset, click "beat ▸", assert via `page.evaluate`
that `useStore.getState().decks[deckId].positionSec` moved by exactly `60/120=0.5s`
(±float tolerance) and that the deck's `beatGrid` itself is untouched (confirms the
"invisible to phaseDeltaSec" claim — this is the one thing worth automating,
since it's the crux of why this feature is safe). Also asserts the three guard
notices (master deck / no grid / loop active) fire instead of silently no-op-ing.

## 7. Verification order

1. `shiftDeckByBeat` + `dispatch` case + button → `npm run check` green.
2. `scripts/verify-beat-shift.mjs` → confirms the mechanics (exact shift, SYNC
   math untouched, guards fire) without needing a real mix.
3. **Shalom, real library, real mix** — this is what actually closes the feature:
   play two tracks, SYNC, listen for the "mess," tap ◂/▸ until it resolves. Report
   whether it worked, whether one press is usually enough, and whether the two
   clean pilot tracks tested for GridFix (CYBER SAMURAI, END OF DINO — already
   confirmed near-round BPM) are a good first pair to try.
4. `ROADMAP.md`: renumber current v0.8.8 (sampler export) → v0.8.9, current v0.8.9
   (Mix Assist sound-match) → v0.9.1 (free slot, no collision with v0.9.0/v0.9.5),
   insert this feature as v0.8.8. `HANDOFF.md` updated, the inaccurate "Set
   downbeat here fixes this" line corrected at the same time (flagged earlier,
   still pending).
