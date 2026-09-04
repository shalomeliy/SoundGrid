# FEATURE_SPEC — v0.4.5: "השיר הבא" — hardening the already-shipped mix highlighter

Status: approved-pending-user-confirmation. Written from a fan-out of product-expert,
architecture-expert, design-expert and qa-expert reviews (security not triggered — no
new external input, no new file/library access, no new dependency), plus three scope
decisions the owner made directly in this session (see "Open decisions" below).
`SECURITY NOT TRIGGERED — no trust boundary crossed by this change.`

## Context and observed problem

`ROADMAP.md`'s original v0.4.5 spec called for three things: BPM proximity (incl.
half/double-time), Camelot key compatibility, and energy proximity, driving a graded
highlight in the library while a deck plays. Two of the three are already built and live
on `main` — `src/core/recommend.ts` (`mixRecommendations`, `keysCompatible`) wired into
`src/app/components/Library.tsx` (a `useMemo` recompute keyed on both decks'
playing/bpm/tempo/track/camelot, a combined "♫ N mixable" toggle+filter button, and
per-row bold+colored-dot / dim-dot rendering) — but nobody verified it against the
version's own written acceptance criteria, and it has zero automated tests despite being
pure `core/` logic. The third piece, energy proximity, does not exist anywhere in the
codebase: there is no per-track energy/loudness metric today (`bands` in
`core/types.ts` is a waveform-*coloring* artifact, not a track-level score).

An independent four-angle review (product/architecture/design/QA) surfaced concrete,
verified gaps in what's already shipped:

- **Doc/code mismatch**: `ROADMAP.md` says "±6% BPM"; the code actually gates any match
  at 8% error and a *strong* (bold) match at 3% (`recommend.ts:77,82`). Found
  independently by three of four reviewers.
- **No tests**: `tests/core/` has 9 files covering beatgrid, hotcues, genres, etc. —
  none for `recommend.ts`, the exact logic that decides what gets highlighted.
- **A real tie-break bug**: when a track matches two playing decks with equal tempo
  error, `err < bestErr` (strict) picks the first deck by array order regardless of
  which is the actually-better match (`recommend.ts:67-75`).
- **Legibility at real scale**: the match dot and the unrelated analysis-state dot are
  both `h-1.5 w-1.5` (6 CSS px → ~4.6px physical on the owner's 125%-scaled 14" laptop,
  per `CLAUDE.md`'s 0.76 multiplier). Strong-vs-loose is opacity-graded on that same
  sub-5px dot — not reliably legible while scrolling a live list.
- **Silent zero-state**: the "♫ N mixable" button is conditionally rendered only when
  `recs.size > 0` (`Library.tsx:418`). A deck playing with nothing currently mixing shows
  *nothing* — no way to tell "no matches right now" from "feature isn't here." This is
  the same class of silent gap `CLAUDE.md`'s central rule forbids elsewhere in the app.
- **No keyboard/screen-reader path**: the match reason lives only in a native `title`
  attribute on a non-focusable `<tr>` (`Library.tsx:685-717`) — hover-only, which
  undercuts the original spec's own "never rely on color alone (accessibility)" bullet
  for anyone not using a mouse.

## Target user and decision

The owner: a solo DJ, non-programmer, glancing at the library while a deck is already
playing live, in front of people. The decision this feature serves is "which track do I
reach for next" — it has to be trustworthy at a glance, in under a second, without
requiring a hover or a second look.

## User and business outcome

Every track that genuinely mixes with what's playing is highlighted correctly and
legibly at the screen's real physical size, updates within 100ms of a deck swap, is
explained through more than color and more than a mouse hover, and never goes silently
missing when there's simply nothing to recommend. The logic that decides all of this is
covered by real tests, so a future change to the thresholds or the tie-break rule fails a
test instead of shipping unnoticed.

## Goal

1. **Verify, don't just trust, the existing acceptance criteria.** Confirm the deck-swap
   update happens within 100ms in the running app (not the type checker), with a
   browser-verified script following this repo's `scripts/verify-*.mjs` pattern.
2. **Add real unit tests for `core/recommend.ts`** — `keysCompatible` (same code, ±1,
   wrap-around, relative major/minor, non-adjacent, malformed input, case sensitivity)
   and `mixRecommendations` (half/double-time selection, the 8%/3% two-tier boundary,
   exclusion of null-BPM and already-loaded tracks, both-decks-playing tie-break,
   empty-input edge cases) — roughly 20+ cases, in `tests/core/recommend.test.ts`.
3. **Fix the tie-break**: when two playing decks tie on tempo error for the same track,
   prefer the deck with a compatible key over one that clashes or is unknown, before
   falling back to array order. Small, contained change to `mixRecommendations`.
4. **Reconcile the doc/code mismatch**: keep the shipped 8%/3% thresholds (already live,
   no reason to change working, unverified-as-wrong behavior) and correct `ROADMAP.md`'s
   "±6%" prose to describe the real two-tier rule.
5. **Fix the two real UI gaps**:
   - Replace the opacity-only strong/loose distinction on a ~4.6px-physical dot with a
     size/fill distinction that survives the owner's actual screen (filled dot for
     strong, outline/ring for loose), visually separated from the unrelated
     analysis-state dot it currently sits flush against.
   - Show an explicit "no mixable tracks" state instead of the button vanishing when a
     deck plays and `recs.size === 0`.
6. **Close the accessibility gap**: give the match reason a non-hover path — a focusable
   row (or equivalent) with an `aria-label`/accessible name carrying the same
   information the tooltip does, when a match is present.

## Non-goals

- **Energy proximity** — explicitly out of scope for this version (see "Open decisions").
  No energy metric, no analyzer change, no cache-version bump here.
- Real audio-based key detection (blocked on `v0.9.0`, itself not yet built) — Camelot
  compatibility stays tag-derived, exactly as it is today.
- Any redesign of the highlight system beyond the two concrete legibility/zero-state
  fixes above — no three-tier visual system, no new chrome, no Settings exposure of the
  match thresholds (calibration constants stay out of Settings per the v0.2.5 rule).
- Linking the match's `keyMatch` signal into the existing Camelot-wheel key-color system
  (`keyColor()`) — a real design opportunity the design review noted, but a visual-system
  change, not a hardening fix; left for a future pass if the owner wants it.

## Assumptions

- The already-shipped 8%/3% thresholds are the intended behavior (owner confirmed:
  don't change what's tuned and working without a measured reason to).
- "Loose match" still means dot-only, no bold — only *how* the dot communicates that
  changes, not the underlying strong/loose semantics.

## Proposed experience

No new screens or panels. Within the existing library row and header:

- A strong match: bold track title (unchanged) + a small filled dot in the matching
  deck's color.
- A loose match: dot only, rendered as an outline/ring instead of a dimmed filled circle,
  so it reads distinctly from the analysis-state dot beside it and survives the laptop's
  real ~0.76x physical scale.
- The match reason (which deck, tight vs. loose, key compatible/clashing/unknown) is
  reachable without a mouse — at minimum an accessible name on the row equivalent to
  today's tooltip text.
- When a deck is playing and nothing in the library currently mixes, the header shows
  that state explicitly instead of the button disappearing.

## System/data implications

None beyond `core/recommend.ts` and `Library.tsx` — no new `core/ports/`, no platform
capability, no persistence change, no dependency-cruiser boundary crossed. Pure logic
change plus presentational change.

## Acceptance criteria (observable behavior)

- `npm test` includes `tests/core/recommend.test.ts` and it is green, covering the case
  list above.
- A browser-verified measurement shows the highlight set updates within 100ms of
  swapping the loaded track on a deck.
- A track within the shipped strong threshold (≤3% tempo error, tempo-adjusted) and a
  compatible key renders bold with a filled dot; a track between 3% and 8% renders an
  outline dot, not bold; a track beyond 8%, or already loaded on a deck, or with no BPM,
  shows no match at all.
- When two playing decks tie exactly on tempo error for the same track and one has a
  compatible key while the other doesn't, the compatible one is chosen.
- With a deck playing and zero library matches, the header shows an explicit "no
  mixable tracks" state, not an absent button.
- The match reason is available via keyboard/assistive tech, not only mouse hover.
- `ROADMAP.md`'s v0.4.5 section states the real 8%/3% behavior, not "±6%".

## Loading, empty, error, partial, recovery states

- **Empty** (no deck playing): unchanged — no highlighting, no header control shown
  (this state was already correct and isn't part of the reported gaps).
- **Empty matches while playing** (new): explicit "no mixable tracks" state (goal #5).
- No new error or loading states — this feature has no async operation of its own; it
  derives synchronously from state already in the store.

## Accessibility / security / privacy / operational constraints

- Accessibility is the core of goal #6 above — this is the fix, not a constraint that's
  merely respected.
- `SECURITY NOT TRIGGERED` — no new external input, file access, or dependency.
- No calibration constant (the 8%/3% thresholds, or any new tie-break constant) is
  exposed on the Settings screen, per the existing v0.2.5 rule
  (`tests/repo/settings-layer3.test.ts`).

## Verification plan and evidence

- `npm run check` green (tsc + oxlint + depcruise + vitest), including the new
  `recommend.test.ts` suite.
- A new browser-verification script (`scripts/verify-recommendations.mjs`, Playwright,
  following the `verify-analysis-queue.mjs` pattern) exercising: load a track on deck A,
  confirm it's excluded from its own recommendations; load a compatible track on deck B,
  confirm a strong match renders; load a clashing-key track, confirm a loose match
  renders; swap the deck A track and measure the highlight update latency.
- Manual owner verification in the real running app per this repo's "hand the user a way
  to check it" rule (written in Hebrew when this closes).
- Independent review via `.claude/agents/change-reviewer.md` before closing, as this
  repo's Definition of Done requires.

## Open decisions and tradeoffs (resolved this session, recorded here)

1. **Scope: harden vs. also build energy proximity now.** All four expert reviews
   independently recommended deferring energy — it requires defining what "energy" even
   means (RMS? spectral? perceptual loudness?), a new analysis pass (likely a real audio
   decode, not a cheap tag read), a cache-version bump, and new scoring/UI — sized as its
   own version, not a tail addition. The owner initially chose to build it now, then,
   after the tradeoff was made explicit, chose to defer. **Decision: defer.**
2. **The ±6% (doc) vs. 8%/3% (code) mismatch.** Owner decision: keep the shipped,
   already-working thresholds; fix the ROADMAP prose to match reality rather than risk
   changing live matching behavior without a measured reason.
3. **Where energy proximity goes now that it's deferred.** Owner decision: its own
   future version (tracked as `v0.4.7` in `ROADMAP.md`, placeholder only — no detailed
   spec written yet; needs its own product/architecture pass when picked up), not folded
   into `v0.4.6` (Mix Assist) and not silently dropped.
