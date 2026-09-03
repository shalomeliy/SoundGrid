# FEATURE_SPEC — v0.4.0: Continuous analysis + persistent metadata

Status: approved-pending-user-confirmation. Written from a fan-out of product-expert,
architecture-expert, design-expert, qa-expert and security-expert reviews (security
triggered — this reads and hashes the user's own files), plus four product decisions
the owner made directly in this session. `SECURITY TRIGGERED — reviewed, no blocking
finding, see "Accessibility / security / privacy / operational constraints" below.`

## Context and observed problem

Every time the owner picks their music folder (~360 files), every track is decoded and
re-analyzed from scratch — waveform peaks, BPM/beatgrid via autocorrelation
(`src/platform/analyzer-js/analyze.ts`, backed by `src/core/beatgrid.ts`) — inside the
synchronous `loadTrackToDeck` pipeline (`src/controls.ts:91-188`) every single time a
track is loaded to a deck, with nothing kept between sessions. `startSec` is
hard-coded to `0` (`controls.ts:166`) because no cue point survives a reload at all.
The Settings screen already has an `onLoadPlayhead` control (`core/settings.ts:39,293`)
that is dead on arrival — its `pending` label says outright: "Cue points are not saved
between loads yet (v0.4), so this behaves as Start until then." The seams for all of
this were already drawn in v0.1.6 and left unimplemented on purpose:
`core/ports/analyzer.ts` (`Analyzer` + `AnalysisCache`, doc-commented "v0.4 moves this
to a Web Worker with a real cache") and `core/ports/persistence.ts` ("Cue points, saved
loops and the analysis cache all land here from v0.4 on").

Separately, `Track.id` is built from the file's scan-relative path
(`src/platform/source-fsaccess/library.ts:225`, `` `${prefix}${name}` ``). v0.3.2
accepted, as known debt, that moving a file to a different genre folder silently
detaches its manual genre override, because the id — and therefore the override's
key — changes (`HANDOFF.md`, "עריכת ז'אנר ידנית אובדת בשקט אם הקובץ זז לתיקייה
אחרת"). The same fragile identity would apply to anything else keyed by `track.id`.

## Target user and decision

The owner (solo DJ, non-programmer) wants decks that are instantly ready — BPM, grid,
waveform, and now saved cue points/hot cues — every time they reload a track they've
already played, without a multi-second re-analysis wait, and without ever silently
losing an edit (a genre override, a hot cue) just because a file moved folders.

## User and business outcome

A track is analyzed once and remembered forever. Reloading it — even after the app is
closed and reopened, even after the file moved to a different folder — is near-instant
and preserves everything the owner set on it (genre, hot cues, cue point). Nothing about
analysis state is ever invisible: what's queued, what's done, and what failed are all
named in the UI, matching this repo's standing "never skip silently" rule.

## Goal

1. Move analysis (decode, peaks, BPM, beatgrid) off the main thread into a Web Worker,
   queued with a concurrency limit, running automatically in the background as soon as a
   folder is picked or files are added — not gated on the owner clicking anything.
2. Cache the result in IndexedDB, keyed by the track's content — not its path — so the
   cache (and everything else keyed by track identity) survives a file move.
3. Show per-track analysis state in the library (queued / analyzing / analyzed / failed)
   and a header count, following this repo's existing badge/notice idiom.
4. Persist the owner's hot-cue bank (`DeckState.hotCues`) and the single CUE-button
   point (`DeckState.cuePointSec`) per track, and wire the already-existing
   `onLoadPlayhead` Settings control to the real saved cue point, removing its `pending`
   label.
5. Loading a track to a deck never blocks on its own analysis: it loads immediately with
   whatever is already available (tag BPM, cached peaks/grid/cues if present) and the
   deck's waveform/grid/cue UI fills in live if analysis is still running or gets queued
   at that moment.

## Non-goals (explicitly out of scope for v0.4.0)

- Real audio-derived key detection (`v0.9.0` — this version still only has Camelot from
  tags, unchanged).
- Continuous playing-track "next song" recommendation UI (`v0.4.5`) and Mix Assist
  (`v0.4.6`) — both explicitly blocked behind this version in `ROADMAP.md`/`HANDOFF.md`,
  not touched here.
- A generic implementation of `Persistence`/`platform/persist-idb/` as a single catch-all
  store. Per this repo's own established pattern (`genre-overrides-idb/store.ts:4-8`
  explicitly declines the generic port for the same reason), the analysis cache and the
  cue/hot-cue store are dedicated IndexedDB stores, e.g. `platform/analyze-cache-idb/`
  and `platform/cues-idb/` (or one store if the plan phase finds that simpler) — not a
  generic key/value repository. `core/ports/persistence.ts` stays an unimplemented seam.
- Manual retry UI for a single failed track beyond a generic "try again" — a stretch goal
  if it fits, not a blocking criterion.
- Any change to `platform/genre-overrides-idb/`'s own storage format beyond re-keying it
  onto the new content-hash identity (see below) — its resolution priority
  (folder-derived, overridden by manual pick) is untouched.

## Assumptions (from the owner's decisions this session)

| Decision | Chosen | Rejected alternative |
| --- | --- | --- |
| When background analysis runs | Automatically, the moment a folder is picked/added — the owner never has to click "analyze" | Manual per-track or per-folder trigger only |
| What "cue points" means in this version | Both `cuePointSec` (the single CUE-button point `onLoadPlayhead` refers to) **and** the full `HotCue[]` bank set via the pads | Only the single point |
| Track identity | Unify: `track.id` becomes content-hash-based everywhere (genre overrides included), fixing the v0.3.2 file-move bug as a side effect | Leave genre-override identity on path, add a second hash-based identity only for the analysis cache |
| Loading an unanalyzed/failed track | Loads immediately with whatever's already available (tag BPM, no waveform/grid/cue yet); completes live in the background if/when analysis finishes | Block the Load button until analysis is done |

## Proposed experience

**On folder pick / add-files.** The existing two-pass shape (`runScan` →
`applyGenreOverrides` → `applyTags`, `Library.tsx:216-227,261-266`) gains a third,
asynchronous pass: every track is queued for background analysis automatically, no
button. This is consistent with the app's existing "nothing needs a manual go" pattern —
introducing a manual trigger here would be the first exception to it, without a stated
reason.

**Per-row status.** Reuses the existing leading-icon slot already used for the
BPM-match dot in the Title cell (`Library.tsx:569-583`) rather than a new column — there
is no spare width budget (Title/Artist/BPM/Key/Load are load-bearing,
`Library.tsx:487-488`). Four states — queued, analyzing, analyzed, failed — are
distinguished by shape/motion, not color alone (a static dot vs. a pulsing dot vs. no
icon vs. a distinct failed glyph), because at this app's actual physical scale (CSS px
× 0.76 on the owner's 157-PPI panel) a small dot's hue alone is not reliably legible.
Failed gets a tooltip naming why, mirroring the header badges' existing `title`
attribute pattern (`Library.tsx:379-383,396-397`). Status is **not** inferred from
whether `Track.bpm` is populated — tag-read BPM already fills that field before analysis
ever runs (`Library.tsx:281-307`) and analysis is told never to clobber it — so a
distinct `analysisState` field drives the icon, not a guess from an existing cell.

**Header count.** "N queued" (neutral tone) while background work remains, "K failed"
(existing `text-warn` tone) once any track fails — same badge token already used for
"N skipped"/"N unreadable" (`Library.tsx:378,396,410`), conditionally rendered only
while non-zero, in the same horizontal strip. No progress bar, no modal — the table
stays fully usable (draggable, loadable) while the queue runs behind it.

**Instant cache-load path.** A track with a valid, matching cache entry loads through
the existing `DeckState.loading` flag (`core/types.ts:46`) exactly as today — at
&lt;200ms that flag will barely be visible, which is correct, not a missing state.

**Cue points and hot cues.** Setting a hot cue (pad) or the CUE-button point persists
it immediately (through `controls.ts`, this repo's one choke point for user actions) to
the new cue store, keyed by the track's content-hash id. Reloading the same track — same
session or a fresh one — restores `hotCues` and `cuePointSec` from that store.
`onLoadPlayhead` (`'start' | 'firstCue'`) reads `cuePointSec` from the just-loaded
track's restored state when set to `firstCue`; its `pending` label and warning text
(`core/settings.ts:297`) are removed once this is wired.

**Redefining a hot cue (owner's decision this session).** Today (`PadGrid.tsx`, already
shipped, unchanged by this version's persistence work) an occupied pad only jumps to its
cue on click; deleting requires an undiscoverable `Shift`+click, hinted only by small
static text next to the grid's header. This version replaces that with a small `×`
that appears only on hover over an occupied pad (same hover-reveal idiom already used
for the Key-mode toggle and the v0.3.2 genre-cell dropdown) — clicking it deletes that
cue and returns the pad to its empty look (the same neutral "no cue set" color/state
already used for pads that were never set), so the owner can then click the empty pad
to set a new cue at the current position. The existing `Shift`+click gesture stays as a
second way to do the same delete (by the owner's explicit choice — it doesn't hurt to
keep it for muscle memory), so an occupied pad can be cleared either by hovering and
clicking the `×` or by `Shift`+click; both do the identical delete. The static hint text
next to the grid's header is updated to mention the `×` rather than only `Shift`+click,
since the hover affordance is now the primary, discoverable one. This is a same-version
UI change to `PadGrid.tsx`, independent of the persistence work, but ships together with
it since both touch the same component and the delete-then-redefine flow is what needs
to survive a reload once cues persist.

**Identity unification.** `track.id` moves from `` `${prefix}${name}` `` (scan-relative
path) to the same content hash used as the analysis-cache key. `genre-overrides-idb`'s
stored keys are migrated from path-based ids to content-hash ids (a one-time migration
pass reading the existing store and re-keying entries it can still match to a scanned
file; entries for files no longer present are dropped, not silently retried forever).
This means a file's genre override, hot cues, and cached analysis all survive a move to
a different folder and a rescan — the exact bug v0.3.2 accepted as debt is closed as a
side effect of this version, per the owner's explicit choice.

**Cost this creates, stated plainly:** identity-by-content means every track's full
bytes are read and hashed at scan time — not only for tracks the owner loads to a deck,
as happens today. This is materially more scan work than today's 0.6s/360-files tag-only
byte-range read (`HANDOFF.md`). The verification plan below requires this be measured
against the owner's real library before the version is called done; if the number is
unacceptable, the fallback (recorded here so it isn't rediscovered mid-build) is: keep
the path-based id as the *display* identity for session-stability, compute the content
hash asynchronously in the same background queue as analysis, and have overrides/hot
cues/cache resolve by content hash only once it's ready — with a defined, visible state
for "identity not yet confirmed" in between. This fallback is **not** the default plan;
it is the documented escape hatch if the real-library measurement comes back bad.

## System / data implications

- **`platform/analyzer-worker/`** (new) implements `core/ports/analyzer.ts`'s
  `Analyzer` behind a Web Worker, with a queue and a concurrency limit. Gated on a new
  `capabilities.ts` flag (Worker support check, following the existing pattern for
  `audioWorklet`/`webgpu`/etc., `docs/architecture/directions.md` §3) — if unsupported,
  analysis falls back to today's synchronous main-thread path with no crash and a
  visible note, per the Capabilities "no feature crashes, none pretends to work" rule.
- **`platform/analyze-cache-idb/`** (new, dedicated store, mirroring
  `genre-overrides-idb/` and `settings-idb/` — not the generic `Persistence` port,
  per this repo's established precedent). Each entry: `{ contentHash, analyzerVersion,
  fileSize, analysis: TrackAnalysis, cachedAt }`. `analyzerVersion` is a constant bumped
  whenever `core/beatgrid.ts` or the analysis logic changes meaningfully (e.g. the
  existing `CONFIDENCE_RATIO` retuning history, `beatgrid.ts:53`) — a cache hit whose
  stamped version doesn't match the current one is treated as a miss and re-analyzed.
  Without this, a future analyzer change would silently keep serving old cached
  BPM/grids forever with no visible sign anything's stale — exactly the class of bug
  this repo's "never skip silently" rule exists to prevent.
- **Content hash**: SHA-256 via `crypto.subtle.digest`, computed over the full file
  bytes already being read for analysis (no second read). Chosen over a fast/weak or
  sampled hash because a collision here would silently serve one track's BPM/grid/peaks
  (or cue points, or genre override) for a *different* track — a correctness failure,
  not an adversarial-security one, but the same "silent wrong data" class this repo
  forbids. Reading whole-file bytes for hashing is not "decoding a track into memory"
  (that rule, `tags.ts:10-13`, is about not building an `AudioBuffer`) — the deck-load
  path already does a full `file.arrayBuffer()` read today (`library.ts:240-243`,
  called from `controls.ts:121`) before decoding, so this reuses bytes already in
  memory on that path; the scan-time hash of *every* track is the new cost named above.
- **`platform/cues-idb/`** (new, dedicated store) holds `contentHash -> { hotCues,
  cuePointSec }`, written on every pad/CUE-button change via `controls.ts`, read once
  after each track's identity (content hash) is known.
- **`Track.id`** becomes the content hash; `Track.analysisState: 'queued' | 'analyzing'
  | 'analyzed' | 'failed'` and `Track.analysisError?: string` are added to
  `core/types.ts` to drive the row indicator explicitly (not inferred).
- **File System Access + Worker boundary**: a `FileSystemFileHandle` saved from a
  previous session can have its OS-level permission revoked outside the browser. A
  Worker calling `getFile()` on such a handle must have its rejection caught and
  surfaced as that track's `failed` state with a named reason (mirroring the existing
  unreadable-file handling, `library.ts:305-309`) — never a queue entry that silently
  disappears.
- **`loadTrackToDeck`** (`controls.ts:91-188`) changes its `startSec` from the hard-coded
  `0` to read the restored `cuePointSec`/`onLoadPlayhead` setting, and no longer performs
  analysis inline for a track with a valid cache hit — it reads cache first, falls back
  to (and enqueues, jumping the queue) synchronous or Worker analysis only on a miss.

## Acceptance criteria

1. Loading the same track a second time (from cache, unmoved or moved) is measurably
   &lt;200ms, with no re-analysis — the number is recorded, not asserted (see
   Verification).
2. Picking the owner's real `Tracks` folder automatically queues all tracks for
   background analysis with no click; the header shows a live "N queued" count that
   drains to zero, and each row's status icon reflects its real state at every point.
3. A track whose analysis fails shows a distinct, non-color-only "failed" indicator with
   a tooltip naming why, and remains loadable to a deck with whatever data is already
   available (tag BPM; no waveform/grid/cue).
4. Setting a hot cue or the CUE-button point on a loaded track, then unloading and
   reloading it (same session and after a full app reload), restores that state exactly.
4a. Hovering an occupied pad shows a `×`; clicking it deletes that cue (pad returns to
   its empty look) and this deletion persists — reloading the track does not bring the
   deleted cue back. `Shift`+click on an occupied pad does the identical delete, kept as
   a second way to trigger it. Clicking the now-empty pad (either way) sets a new cue
   there, which also persists.
5. Moving a file to a different folder and rescanning: its genre override, hot cues, and
   cached analysis all survive — the track is recognized as the same track by content,
   not by path.
6. `onLoadPlayhead` set to "First cue point" actually moves the playhead to the restored
   `cuePointSec` on load; its `pending` label is gone from Settings.
7. A track with no cache entry and analysis still queued/running, when loaded to a deck,
   plays immediately with tag-only data and its waveform/grid/cue populate live once
   analysis completes — never a blocked Load button.
8. Revoking the library folder's OS-level permission and reloading the app: background
   analysis of previously-granted files fails visibly (named count, not a silently
   drained queue) rather than disappearing with no trace.
9. `npm run check` stays green; `core/`-level logic (state machine transitions, hash
   usage, cache-version invalidation) has unit tests in `tests/core/`.

## Loading / empty / error / partial / recovery states

- **`queued`**: track is known, not yet started. Row icon: static, neutral. Counted in
  the header "N queued" badge.
- **`analyzing`**: Worker actively processing this track. Row icon: pulsing/animated
  variant of the same slot, distinguishable from `queued` without relying on color.
- **`analyzed`**: cache entry exists and its `analyzerVersion` matches current. No icon
  (or a subtle "done" mark) — this is the steady state, not something to keep drawing
  attention to.
- **`failed`**: analysis threw (decode error, unreadable file, revoked permission,
  unsupported codec). Distinct icon + tooltip naming the reason. Counted in a header
  "K failed" badge. The track still loads to a deck with tag-only data (criterion 3).
- **Stale cache (same path, different bytes)**: content hash differs from the stored
  entry's key by construction — a changed file simply misses the cache and re-analyzes;
  no special-case detection code needed, this falls out of hashing content rather than
  path.
- **Worker unsupported**: `capabilities.ts` flag false → falls back to today's
  synchronous main-thread analysis on load, with a visible (not silent) note that
  background pre-analysis is unavailable on this browser/profile.
- **IndexedDB unavailable** (private window, blocked storage — already a handled class
  of failure elsewhere, `reportFailure` pattern in `Library.tsx`): analysis and cue
  edits still work for the current session; persistence failures are surfaced the same
  visible way `settings-idb`/`genre-overrides-idb` already handle it, never swallowed.
- **Genre-override migration on first run of this version**: existing path-keyed
  overrides are re-keyed to content-hash where the file can still be matched by scanning;
  unmatched entries (file no longer present) are dropped, not retried forever or left as
  orphaned dead keys.

## Accessibility / security / privacy / operational constraints

- No color-only status signaling (per this repo's existing Key/BPM-match precedent and
  the design-expert review's flagged risk at this app's actual physical icon size).
- **Security review, triggered and addressed**: this is a local-only, single-user, no-
  auth, no-network feature — hashing and analyzing the owner's own files, stored only in
  their own browser's IndexedDB. No adversarial threat model applies; the two real risks
  are (a) a cache-key collision silently serving wrong data — mitigated by full SHA-256
  over full file content, not a sampled/weak hash — and (b) a Worker failing silently on
  a revoked File System Access permission — mitigated by explicit catch-and-surface as a
  named `failed` state (see System/data implications and acceptance criterion 8). Neither
  introduces a new dependency or external input.
- No data leaves the device; nothing here changes the app's zero-network-dependency
  constraint (`CLAUDE.md`).

## Verification plan and evidence

- **Agent-testable now** (`tests/core/`): the analysis state-machine transitions,
  `analyzerVersion` cache-invalidation logic, and content-hash-based identity resolution
  are pure logic — real unit tests, not just type-checking, per this repo's Definition
  of Done.
- **Agent-testable in the running dev-server app** (`javascript_tool` +
  `read_console_messages`, this remote environment's available tools): mock a small
  library, confirm the queued→analyzing→analyzed/failed sequence renders correctly and
  the second-load timing improves; confirm no console errors from the Worker/IndexedDB
  paths.
- **Owner-testable, required before this version is called done** (v0.1.7 pattern — a
  small Node script or browser-measured run against the real
  `C:\Users\Shalom\Music\Tracks`, numbers written down, not "it worked"):
  - Full-folder scan time **with** content hashing, compared to today's 0.6s/360-files
    tag-only baseline — this is the number that validates or invalidates the identity-
    unification cost named above.
  - Second-load time for ~20 real tracks, cached vs. first load.
  - Confirm a real file move (drag a track to a different genre subfolder, rescan)
    preserves its genre override, hot cues, and cache hit.
- A few plain Hebrew lines handed to the owner at the end of the version: what to click
  (pick the Tracks folder; wait for "N queued" to reach zero; reload a track a second
  time), what should appear (near-instant second load; a hot cue set before survives a
  full app reload; moving a file's folder and rescanning keeps its genre/cues), and what
  would mean it's broken (a second load that's still slow, a hot cue that vanishes, or a
  genre/cue that resets after a file move).

## Known debt this version explicitly does not fix

- Manual retry UI for one failed track — generic re-queue behavior only.
- Worker/analyzer running on browsers where SubtleCrypto or Worker+FSA-handle transfer
  behaves unexpectedly — Chromium desktop only remains this app's stated target
  (`CLAUDE.md`), so this is not tested against other browsers.

## Open decisions and tradeoffs (already resolved by the product owner this session)

| Decision | Chosen | Rejected alternative |
| --- | --- | --- |
| Background analysis trigger | Automatic on folder pick/add | Manual per-folder/track button |
| Cue scope persisted | `cuePointSec` **and** full `HotCue[]` bank | `cuePointSec` only |
| Track identity | Unified to content hash (fixes v0.3.2 genre-move debt) | Two separate identities (path for genre, hash for cache) |
| Loading an unanalyzed/failed track | Loads immediately with available data, fills in live | Blocks Load until analysis completes |
| Scan-time hashing cost | Accepted, with a documented fallback (lazy hash + interim state) if real-library measurement is unacceptable | Silently defer the cost question to implementation |

No further open product questions remain for this spec. File-level implementation
sequencing (exact Worker message protocol, exact IndexedDB schema fields, migration
script shape) is deliberately left to the plan phase (`architecture-plan` skill), per
this skill's own rule that a specification must not become a file-by-file plan.
