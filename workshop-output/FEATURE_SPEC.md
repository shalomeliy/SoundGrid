# FEATURE SPEC — sound-match at transition points (Mix Assist extension)

Not v0.8.5. This is a separate, later feature that grew out of closing v0.8.5's model
choice — v0.8.5 itself (M1 built, M2 measured and decided classical-only, **M3 — the
"find similar" UI in `Library.tsx` — still open**) is unaffected and un-blocked by this
spec; it is expected to close first. Target version for this feature: **v0.8.9** (after
`v0.8.8`, sampler-bank export, already reserved in `ROADMAP.md`).

## Context and observed problem

SoundGrid already ships Mix Assist (`src/core/structure.ts`'s `findTransitionCandidates`/
`energyProximity`, rendered in `src/app/components/TransitionPointsPanel.tsx`): when a DJ
loads a track to a deck while the other plays, a popover lists candidate mix-in points
and compares each one's **loudness** to what's currently playing on the other deck
("close"/"louder"/"quieter than what's playing now"). It never compares the actual
**sound** — two points at the same volume can be a kick drum and a vocal, and the panel
can't tell them apart.

While closing v0.8.5's CLAP-vs-classical decision (CLAP rejected for whole-track "find
similar" because its default truncation randomly crops ~10s of any longer track —
`node_modules/@huggingface/transformers/src/models/clap/feature_extraction_clap.js`),
Shalom described his real mixing workflow: exit track A around its 1st/2nd chorus, enter
track B into its first verse/chorus. What matters for "will this transition work" is the
sound at those specific points, not the whole song — and CLAP's "flaw" (a fixed ~10s
window) is actually the right size for a short, deliberately-placed clip instead of a
whole track.

## Target user and decision

Shalom, at the moment he already uses Mix Assist: a track just loaded, paused, the other
deck playing — a planning moment, not mid-transition. The decision this feature informs:
"does this candidate point actually sound like it'll blend, not just play at the same
volume."

## User and business outcome

Fewer surprises after committing to a transition picked from the panel. This is additive
signal, not a promise: like the existing energy line, it must never claim more certainty
than a short-clip heuristic supports.

## Goal, non-goals, assumptions

**Goal:** for each transition candidate already shown in the panel, add a second,
independent "sounds similar / sounds different from what's playing now" reading,
alongside (never replacing) the existing energy reading.

**Non-goals (v1 of this feature):**
- Not a merged/replaced UI — additive only. A full replacement is a later, separate
  decision Shalom makes explicitly; this build must not hard-wire the two signals
  together so that replacing one is a rewrite.
- Not live re-embedding of the outgoing deck's continuously-moving playhead position.
  Compared value: the outgoing deck's own **nearest upcoming transition candidate**
  (found the same way `nextCandidateFrom` already picks an "exit point" today), not the
  literal instantaneous position. Both sides are always precomputed/cached — nothing is
  embedded live during playback.
- Not a change to the whole-track "find similar in library" cache or feature (v0.8.5) —
  separate cache, separate use case, may reuse the same `Embedder`/model choice or not.
- Not a merged confidence score, not a threshold-tuning UI (blocked anyway by this
  project's no-calibration-in-Settings rule), not reuse in the whole-library search.

**Assumptions:** `findTransitionCandidates`'s candidates are deterministic given a
track's energy contour and `structure.ts`'s tunable constants — stable until those
constants change.

## Proposed experience

`TransitionPointsPanel.tsx`: each candidate row keeps its existing energy dot + label,
and gains a **second small dot on the same row** (not a second line — the panel is
already height-capped, v0.8.6). Label text stays one line; when the two signals disagree,
no extra "conflict" copy is added — two independently-colored, independently-labeled dots
already communicate "these are two separate readings" once seen a couple of times, and
inventing a "these disagree" callout would claim a certainty about what disagreement
*means* that neither heuristic supports.

Copy (mirrors `PROXIMITY_LABEL`'s hedged register exactly):
- similar: "sounds similar to what's playing now"
- different: "sounds different from what's playing now"
- not yet computed: dot only, `var(--color-grid-dim)` (same token as the existing "can't
  compare" state), no promise implied, no second sentence per row.

No change to the panel's empty state ("No clear transition points found") — nothing to
attach a sound reading to when there are no candidates.

## System / data implications

- **Extraction point:** `queueLibraryAnalysis` (`platform/source-fsaccess/library.ts`,
  ~line 386-406), same cache-miss branch as v0.8.5's whole-track embed call. Right after
  `analyzerWorker.analyze` resolves, `analysis.bands`/`durationSec`/`beatGrid` are already
  in hand — call `findTransitionCandidates` there (pure, no extra decode), then embed a
  ~10s window around each candidate.
- **Window extraction:** extend `pcmCopyFromAudioBuffer` (`platform/analyzer-js/
  analyze.ts`) — `AudioBuffer.copyFromChannel(dest, channel, startFrame)` per candidate,
  each call producing an independently-owned array. Same fix v0.8.5 already applied once
  for the two-`embed()` aliasing bug, applied N times instead of once; no new risk.
- **Cache:** a new store (not a bigger record in `embed-cache-idb`'s existing whole-track
  table — different read shape: this needs "all candidate vectors for a track" at once).
  Key: `` `${modelId}:${contentHash}:${structureVersion}:${candidateSec.toFixed(1)}` ``.
  Reuses `embed-cache-idb`'s `modelId`/`embedderVersion` versioning semantics.
- **`STRUCTURE_VERSION`:** a new constant next to `structure.ts`'s tunable heuristic
  constants (`LOCAL_DEVIATION_RATIO`, `MIN_SUSTAIN_SEC`, etc.), stored per cache record
  and checked on read alongside `embedderVersion` — closes the silent-staleness gap
  (candidate timestamps shift if those constants are ever retuned; `embedderVersion`
  alone wouldn't catch that). A repo-level test (pattern: `tests/repo/`) should fail if
  any of those constants change without a matching version bump.
- **Comparison:** live at panel-render time, but cheap — both sides are cache lookups +
  one cosine op (`core/embedding-search.ts`'s existing `cosineSimilarity`), not inference.

## Model choice (open, delegated with a constraint)

Whole-track M1/M2 numbers don't transfer: a 10s window is CLAP's actual native size, not
a truncation artifact, so this is a genuinely new question, not a re-ask of the M1/M2
answer. Shalom delegated the final choice, with one constraint on how it's evaluated:
**only measure/compare candidate pairs that already share the same BPM (required) and,
where possible, the same musical key (preferred)** — because those are the only pairs a
DJ would actually consider mixing regardless of how the sound-match reads, so they're the
only pairs worth judging the heuristic against.

Verification plan (v0.1.7 pattern, real files + real judgment, not guessed): a small Node
script picks a handful of same-BPM (key-matched where available) candidate-point pairs
from Shalom's real library, computes both classical and CLAP cosine scores for each pair,
and Shalom labels each pair "blends"/"doesn't blend" by ear — same-machine run as the M2
CLAP measurement, since only his machine has both the real library and real ears. Model
choice is made from that comparison, not inherited from M1/M2's whole-track numbers.

## Acceptance criteria (observable behavior)

- A track with candidates and completed background analysis shows a second dot per row,
  colored/labeled per the states above.
- A candidate too close to the track's start/end for a full ~10s window: distinct
  "can't extract" state (grey dot), never a padded/partial embedding presented as real.
- A track with zero candidates: unchanged from today.
- Background analysis still running or failed for a track: second dot reads the same
  "not yet computed" grey state as "can't compare yet" already does for energy — no new
  failure-vs-pending distinction needed unless testing shows it's actually confusing.
- Disagreement between the two signals (e.g. close energy, different sound): both dots
  render their own true reading; no merged verdict, no extra copy.

## Loading / empty / error / partial / recovery states

Covered above: not-yet-computed (grey, per-row), can't-extract (grey, boundary case),
empty-panel (unchanged, energy-level "no candidates" message), disagreement (both shown
plainly). No global loading state beyond what the panel already has.

## Accessibility, security, privacy, operational constraints

- **Accessibility risk (flagged by design review):** two same-hue dots on one row must
  not be the only way to distinguish the two signals for a user who can't resolve two
  adjacent 4px same-color dots — verify the per-dot label (hover/state text) always names
  which signal it is, never a merged summary, before this ships.
- **Security/privacy:** `SECURITY: no material change from the v0.8.5 conclusion` —
  local-only, same `Embedder` port, no network calls, no new server surface. Storing
  multiple short-clip vectors per track (vs. v0.8.5's one whole-track vector) doesn't
  cross a new trust boundary. Two items to carry into implementation: (1) extend the
  v1.0.0 privacy disclosure to explicitly name per-candidate clip vectors, not just the
  whole-track one; (2) confirm the new cache key can't collide across two different
  candidates of the same track (the key shape above already includes `candidateSec`, so
  this should already hold — verify with a test, not by inspection alone).
- If CLAP is chosen: pinned revision hash + integrity verification for the one-time model
  download (same rule already flagged elsewhere in the codebase, `worker.ts:57`'s
  unpinned pattern is not to be copied).

## Verification plan and evidence

- `tests/core/`: window-extraction bounds (candidate near start/end, track shorter than
  window), cache-key/version resolution (mirroring `embedding-cache.test.ts`'s existing
  pattern — `STRUCTURE_VERSION` mismatch invalidates), cosine math already covered.
- Real-library, v0.1.7-pattern measurement (see Model choice above) — numbers written
  down in `docs/handoff/v0.8.9.md` at close, not "it worked."
- `npm run check` green before every commit, same gate as always.

## Open decisions and tradeoffs (resolved this session — recorded, not reopened)

| Question | Resolution |
| --- | --- |
| Additive vs. replace UI | Additive — two dots, same row, not two lines (height-capped panel). Full replace is a later, separate decision on Shalom's say-so. |
| Live vs. precomputed outgoing-side comparison | Precomputed only — outgoing deck's own nearest upcoming candidate, never the literal live playhead position. |
| Model for short clips | Delegated to the session, decided via a small real measurement constrained to same-BPM (required)/same-key (preferred) pairs — not inherited from the whole-track M1/M2 result. |
| Cache shape | New store, keyed `(modelId, contentHash, structureVersion, candidateSec)`, separate from the whole-track embedding cache. |
| Staleness on heuristic retune | New `STRUCTURE_VERSION` constant + repo-level check. |
