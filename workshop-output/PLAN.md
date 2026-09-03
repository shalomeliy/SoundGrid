# PLAN — v0.4.0: Continuous analysis + persistent metadata

Grounded in `workshop-output/FEATURE_SPEC.md` (approved). This is the *how*; the spec
is the *what and why* and is not reopened here except where the spec itself named an
open implementation fork and deferred the choice to this phase.

## 1. Current architecture and relevant data flow

`loadTrackToDeck` (`src/controls.ts:91-188`) is the entire synchronous pipeline today:

```
readTrackData(track)        -> file.arrayBuffer()          [library.ts:240-243]
  -> engine.decode(data)    -> AudioBuffer                  [platform/audio-webaudio]
  -> analyzeWaveform(buffer)-> peaks/bands                  [analyzer-js/analyze.ts]
  -> detectBeatGrid(buffer) -> bpm/offsetSec/confident       [core/beatgrid.ts]
  -> patchDeck(...)         -> everything written to zustand, nothing to disk
```

Nothing survives a reload: `hotCues: []` and `cuePointSec: startSec` (`startSec` is
hard-coded `0`, `controls.ts:166,179-180`) are reset on every load. `scanLibrary`
(`library.ts:194-238`) is cheap (no file content read, directory walk only) and builds
`Track.id` as `` `${prefix}${name}` `` — the scan-relative path. `readLibraryTags`
(`library.ts:266-319`) is the existing "second pass after the list renders" pattern:
byte-range tag reads, batched, non-blocking. `genre-overrides-idb/store.ts` is the
existing precedent for a small dedicated IndexedDB store keyed by `track.id`, explicitly
declining the generic `Persistence` port. `core/ports/analyzer.ts` and
`core/ports/persistence.ts` are unimplemented seams already annotated for this version.
`capabilities.ts` / `core/ports/capabilities.ts` is the existing feature-probe pattern
(boolean flags, resolved once at boot, no field yet for Worker support).

**Open technical question the spec did not resolve (this plan must, first):** can this
app actually decode audio inside a Web Worker? `engine.decode` today runs on the main
thread. Web Audio's `OfflineAudioContext` is spec'd as constructible in a worker global
scope, but this repo has never verified it against the actual Chromium build this app
targets. Building the whole Worker architecture on an unverified assumption is exactly
the kind of thing CLAUDE.md's "measured, not estimated" rule (`tsconfig-strict` cost
estimate that turned out to be zero) warns against — so step 1 below is a throwaway
spike that answers this before anything else is built on top of it.

## 2. Proposed thin end-to-end slice (first vertical proof)

Before building the full queue/cache/UI, prove the riskiest link end-to-end on one
track: Worker receives a `FileSystemFileHandle`-derived `ArrayBuffer`, decodes it (or
doesn't — see step 1), computes peaks + BPM + a SHA-256 content hash, and posts the
result back to the main thread, which patches one deck exactly like `loadTrackToDeck`
does today. No queue, no cache, no UI change yet. This is the walking skeleton every
later step extends.

## 3. Exact files to add or change

### New files

| File | Responsibility |
| --- | --- |
| `src/platform/analyzer-worker/worker.ts` | The actual Worker script: receives `{fileBytes}`, decodes (if step 1 confirms feasible) or receives pre-decoded PCM (if not), runs `analyzeWaveform`/`detectBeatGrid` (imported from existing `core/beatgrid.ts` and the pure parts of `analyzer-js/analyze.ts` — both already framework-free, importable into a Worker unchanged), computes SHA-256 via `crypto.subtle.digest`, posts `{contentHash, analysis}` or `{error}` back. |
| `src/platform/analyzer-worker/index.ts` | Implements `core/ports/analyzer.ts`'s `Analyzer`, plus a queue: concurrency-limited (start at 2, tunable), FIFO with a jump-the-queue method for "the track just requested for a deck." Owns the one live Worker instance (or a small pool). Falls back to calling today's synchronous main-thread analysis path directly when `capabilities.webWorker` is false — same public API either way, caller doesn't branch. |
| `src/platform/analyze-cache-idb/store.ts` | Implements `AnalysisCache`. Key: `contentHash`. Value: `{ contentHash, analyzerVersion, fileSize, analysis: TrackAnalysis, cachedAt }`. `get` returns `null` (cache miss) if the stored `analyzerVersion` doesn't match the current constant — an intentional miss, not a bug, so a future analyzer change never silently serves stale results. Mirrors `genre-overrides-idb/store.ts`'s shape (own IndexedDB key, try/catch that never throws on read, throws on write so the caller can surface failure). |
| `src/platform/analyze-cache-idb/version.ts` | Exports `ANALYZER_VERSION` (a plain integer/string constant). Bumped by hand whenever `core/beatgrid.ts` or the analysis logic changes meaningfully — the one manual step this design requires, documented at the constant's own definition. |
| `src/platform/cues-idb/store.ts` | `contentHash -> { hotCues: HotCue[], cuePointSec: number }`. Same shape/failure pattern as above. |
| `src/platform/genre-overrides-idb/migrate.ts` | One-time migration: reads the existing path-keyed override map, and for each entry whose path still matches a track in the current scan, computes that one file's content hash (single-file read+hash, not a batch operation) and re-keys the override under the hash in a **new** store namespace; entries that don't match any current track are dropped. Runs once, guarded by a "already migrated" flag written after success so it never re-runs. |
| `src/core/hash.ts` | Pure helper: `bytesToHex(buffer: ArrayBuffer): string` — the only part of "compute a hash" that's pure enough to belong in `core/` (calling `crypto.subtle.digest` itself is a platform concern, since `core/` must stay free of any environment-provided global per CLAUDE.md; the digest call lives in `platform/analyzer-worker/worker.ts` and `platform/source-fsaccess/hash.ts` below, both of which convert their `ArrayBuffer` result through this shared hex formatter). |
| `src/platform/source-fsaccess/hash.ts` | `hashFile(handle: FileSystemFileHandle): Promise<string>` — reads the file once, digests via `crypto.subtle.digest('SHA-256', ...)`, formats via `core/hash.ts`. Used for the two single-file, on-demand hash paths below (not the batch queue, which hashes as a side effect of analysis inside the Worker). |
| `tests/core/hash.test.ts` | Unit tests for `bytesToHex` (known input → known hex output; empty buffer; different inputs never collide in the test's fixed sample set). |
| `tests/core/analysis-state.test.ts` | Unit tests for the state-machine transitions (§5 below) as pure functions, independent of the Worker/IndexedDB. |

### Changed files

| File | Change |
| --- | --- |
| `src/core/ports/capabilities.ts` | Add `webWorker: boolean`. |
| `src/platform/capabilities.ts` | Add the probe: `typeof Worker !== 'undefined'`. |
| `src/core/types.ts` | `Track` gains `contentHash?: string`, `analysisState?: 'queued' \| 'analyzing' \| 'analyzed' \| 'failed'`, `analysisError?: string`. **`Track.id` is unchanged** — see §4 for why identity unification does not mean replacing `id`. |
| `src/controls.ts` | `loadTrackToDeck`: (a) reads `contentHash` from cache if `track.contentHash` is already set and a matching, version-current cache entry exists — skips decode/analyze entirely on a hit; (b) on a miss, after decoding, computes and stores `track.contentHash` from the bytes already in memory (no second read) via `core/hash.ts` + a local digest call, and writes the analysis into `analyze-cache-idb`; (c) `startSec` reads the restored `cuePointSec` (or `0` per `onLoadPlayhead`) instead of the hard-coded `0`; (d) `hotCues: []` becomes the restored bank from `cues-idb`, looked up by `contentHash` once known. `setHotCue`/`deleteHotCue` gain a `moveHotCue(deckId, fromIndex, toIndex)` sibling (§5) and all three persist to `cues-idb` after patching the store, same choke-point pattern as every other control. `setGenreOverride`-equivalent call site (wherever `Library.tsx`'s genre `<select>` calls into `controls.ts`) gains the inline single-file hash-if-needed step before writing the override. |
| `src/platform/source-fsaccess/library.ts` | `scanLibrary` **unchanged** — no batch hashing at scan time (see §4's rejection of that path). `readLibraryTags`-style third pass added: `queueLibraryAnalysis(tracks)` kicks off the background Worker queue for every scanned track, non-blocking, same "returns immediately, results arrive in batches via callback" shape as `readLibraryTags`. |
| `src/app/components/Library.tsx` | Title-cell leading-icon slot (`Library.tsx:569-583`) gains the analysis-state icon, driven by `track.analysisState`, not inferred from `bpm`. Header gains "N queued"/"K failed" badges reusing the existing token (`Library.tsx:378,396,410`). Genre `<select>` commit path routes through the updated `controls.ts` call (inline hash-if-needed). |
| `src/app/components/PadGrid.tsx` | Hover-reveal `×` per pad (shown only on `:hover`/focus, CSS-driven, no new state) calling `ctl.deleteHotCue`; `Shift`+click kept, calling the same function. `draggable` added to occupied pads; `onDragStart` sets a custom MIME type (`application/x-soundgrid-hotcue`) carrying the source index, mirroring `Library.tsx:551-555`'s pattern; `onDragOver`/`onDrop` on every pad call `ctl.moveHotCue(deckId, fromIndex, toIndex)`. |
| `src/core/settings.ts` | Remove the `pending` field and its warning text from the `onLoadPlayhead` field definition (`core/settings.ts:293-300`) now that it has real data to act on. |
| `src/app/components/Settings.tsx` | No structural change — the `pending` paragraph (`Settings.tsx:151`) simply stops rendering once the field no longer carries it. |
| `.dependency-cruiser.cjs` | No change expected — `platform/analyzer-worker`, `analyze-cache-idb`, `cues-idb` all sit under `platform/`, importing from `core/ports` and `core/` the same way existing platform modules do. Verified, not assumed, at step 8 below. |

## 4. API / type changes, including failure behavior, and the identity-unification design

**The spec's open fork, resolved here:** scan-time content-hashing of all ~360 files
(reading full file bytes for every track before the library even renders) is rejected as
the default mechanism — it would block the first paint of a freshly-picked folder for
however long hashing hundreds of files takes, which is a worse regression than the
problem this version fixes. Instead:

- `Track.id` **stays exactly what `scanLibrary` produces today** (scan-relative path).
  Nothing that keys off `id` for React list rendering, row selection, or drag-and-drop
  changes.
- `Track.contentHash` is a **new, separately-populated** field. It fills in three ways,
  cheapest first: (1) for free, as a side effect of `loadTrackToDeck`'s existing full
  `file.arrayBuffer()` read — hashing already-in-memory bytes costs nothing extra; (2)
  for free, as a side effect of the background analysis Worker, which also needs the
  full bytes; (3) on demand, a single-file read+hash (`source-fsaccess/hash.ts`) the one
  time a genre override is set on a track from the library table before its background
  analysis has reached it — a few hundred milliseconds for one file, paid only on that
  explicit click, not at scan time.
- `genre-overrides-idb`, `analyze-cache-idb`, and `cues-idb` are all keyed by
  `contentHash`, not `id`. This is what actually fixes the v0.3.2 file-move bug: once a
  track has a `contentHash` (which every track gets, automatically, within the normal
  background-analysis window), its override/cues/cache travel with it regardless of
  which folder it's later found in.
- **Failure behavior:** a `contentHash` that can't be computed (unreadable file) means
  that track's analysis is `failed` and it simply has no override/cues/cache lookup —
  same as any file the library already can't read. Nothing crashes on a missing hash;
  callers treat it as "not yet identified," the same shape as "not yet analyzed."

**`AnalysisCache.get`** returns `null` on a version-mismatched entry (a stale cache is
represented as a miss, not surfaced as a special state — analysis simply re-runs, which
is already a safe, idempotent operation).

**Worker failure paths** (decode error, unsupported codec, `getFile()` rejecting on a
revoked File System Access permission): every one is caught inside `worker.ts` and
posted back as `{error: string}`, never an uncaught rejection or a silently dropped
queue entry. The queue marks that track `failed` with `analysisError` set to a short,
named reason and moves on — one bad file never stalls the rest of the batch.

## 5. UI state model and data dependencies

```
Track.analysisState: 'queued' | 'analyzing' | 'analyzed' | 'failed' | undefined
```

`undefined` (not yet scanned into the queue at all) and `'queued'` render the same
neutral icon — the distinction only matters internally. Transitions:

- On scan / add-files: every new track → `'queued'`, pushed to the analysis queue.
- Worker picks it up → `'analyzing'`.
- Success → `'analyzed'`, `contentHash`/`bpm`/etc. patched in.
- Failure → `'failed'`, `analysisError` set.
- A track loaded to a deck with no cache hit and no `analysisState` yet (e.g. `+ Files`
  import, which today skips the scan pass) is analyzed inline exactly as it is today —
  synchronously, inside `loadTrackToDeck` — and does **not** need the Worker path at all
  for a single ad-hoc load.

`moveHotCue(deckId, fromIndex, toIndex)`:

```
if fromIndex has no cue: no-op
else if toIndex is empty: relocate — cue.index = toIndex, label = `${toIndex+1}`
else: swap — both cues exchange index and label
always: sort by index (existing pattern, controls.ts:515), persist to cues-idb
```

Data dependency for the header badges: derived counts (`tracks.filter(t =>
t.analysisState === 'queued' || 'analyzing').length`, same for `'failed'`), computed in
`Library.tsx` the same way `skipped`/`unrecognizedGenre` counts already are — no new
store slice needed beyond the `Track` fields themselves.

## 6. Tests at the cheapest meaningful layer

- `tests/core/hash.test.ts` — pure, `core/hash.ts`'s `bytesToHex`.
- `tests/core/analysis-state.test.ts` — pure state-machine transition function(s), if
  extracted as pure functions rather than inlined in `controls.ts` (worth doing purely
  so this is testable without a Worker or IndexedDB).
- A pure `moveHotCue` reducer (relocate vs. swap vs. no-op) extracted and tested the same
  way, independent of `controls.ts`'s store-patching side effect.
- `analyze-cache-idb`'s version-mismatch-is-a-miss logic — testable with a fake `idb-keyval`
  the way existing IndexedDB-backed stores' logic is tested (check `tests/core/settings.test.ts` /
  `library-boot.test.ts` for this repo's existing mocking pattern before writing new tests here).
- **Not unit-testable, browser-verified with recorded numbers instead** (per CLAUDE.md's
  own standard — the audio engine has no automated tests and a runner does not conjure
  them): Worker decode feasibility (step 1), real second-load timing, real scan-time cost
  with the *actual* (rejected-as-default, but still exercised at small scale for the
  single-file hash path) hashing cost, hot-cue persistence across a real reload.

## 7. Risks, rollback, and deliberate non-goals

**Risk 1 — Worker decode may not work in this Chromium build at all.** Mitigated by
step 1 (§8) being a standalone spike with a clear pass/fail gate before any other Worker
code is written. If it fails: fallback architecture keeps `engine.decode` on the main
thread (unchanged) and moves only `analyzeWaveform`/`detectBeatGrid`/hashing into the
Worker, operating on the already-decoded PCM `Float32Array` passed via a transferable
`ArrayBuffer`. Both architectures satisfy the spec's acceptance criteria; only the
Worker's input/output shape changes.

**Risk 2 — `analyzerVersion` bump is a manual, easy-to-forget step.** Named explicitly at
the constant's own definition (`analyze-cache-idb/version.ts`) with a comment pointing
back to this document, mirroring how `beatgrid.ts:53`'s `CONFIDENCE_RATIO` is already
flagged provisional in place. No automated enforcement is proposed — flagging honestly
beats inventing a mechanism (e.g. hashing the analyzer's own source) that adds real
complexity for a problem that's really "remember to bump a number," same as any other
manual-but-documented step already accepted elsewhere in this repo (e.g. the
`HANDOFF.md`/`ROADMAP.md`/`package.json` version triad).

**Risk 3 — genre-override migration touches every existing override once.** Small blast
radius (however many overrides the owner has actually made, likely single digits to low
tens, not 360) but still a data-migration step. Rollback: the migration reads the old
store and writes a new one under a different key; it does not delete the old data, so a
bad migration can be re-run after a fix without data loss, and the old store can be
manually restored if needed. This is stated as the concrete rollback plan, not left
implicit.

**Deliberate non-goals (restated from the spec, not reopened here):** no real
audio-derived key detection; no Mix Assist/next-song UI; no generic `Persistence` port
implementation; no manual per-track retry UI beyond whatever `moveHotCue`/re-queue
already provides "for free."

## 8. Ordered implementation steps, each with its own verification

1. **Spike: can this app decode audio in a Worker?** A throwaway script/component,
   not shipped: spin up a `Worker`, `postMessage` one real track's bytes, attempt
   `OfflineAudioContext`-based decode inside it, `postMessage` back success/failure.
   **Verification:** run it in the actual dev-server app via `javascript_tool` +
   `read_console_messages` against a real file. Records which of the two Risk-1
   architectures this build proceeds with. This gates everything else.
2. **`core/hash.ts` + `platform/source-fsaccess/hash.ts` + `Capabilities.webWorker`.**
   Small, isolated, no behavior change yet. **Verification:** `tests/core/hash.test.ts`
   passing; `npm run check` green.
3. **`platform/analyzer-worker/`** (shape decided by step 1's outcome), wired to a
   feature flag but **not yet called from `loadTrackToDeck` or the scan path** — a
   standalone module first. **Verification:** a temporary manual call from the browser
   console via `javascript_tool` against a real file, confirming peaks/BPM/hash come
   back correctly and match what today's synchronous path produces for the same file
   (a direct before/after comparison, the strongest evidence available without a
   decoded-audio test harness).
4. **`analyze-cache-idb/`.** **Verification:** unit tests for version-mismatch-as-miss;
   browser-verified round-trip (put, reload the page, get, confirm the entry survives).
5. **Wire into `loadTrackToDeck`**: cache-check first, Worker/fallback-analyze on miss,
   write-through cache, `contentHash` populated on the track. **Verification:** the
   <200ms second-load number, measured in the running app and recorded — the spec's
   own acceptance criterion 1.
6. **`cues-idb/` + hot-cue persistence + `onLoadPlayhead` wiring** (remove `pending`).
   **Verification:** set a hot cue and the CUE point, reload the whole app, confirm both
   restore — acceptance criteria 4 and 6, browser-verified.
7. **`PadGrid.tsx`: hover-`×`, kept `Shift`+click, drag-and-drop `moveHotCue`.**
   **Verification:** manual interaction check in the running app (delete via both
   gestures, drag onto empty, drag onto occupied confirms a swap not an overwrite),
   plus the pure `moveHotCue` reducer's unit tests.
8. **Background queue on scan + `Library.tsx` status icons/badges.**
   **Verification:** pick a real or mocked multi-track folder, confirm the queued count
   drains, icons transition, a deliberately-broken file shows `failed` with a reason —
   plus `npm run arch` (dependency-cruiser) staying green now that several new
   `platform/` modules exist.
9. **Genre-override migration + re-key to `contentHash`.** **Verification:** with at
   least one existing path-keyed override present, run the migration, confirm it reads
   under the new key and the old data is still present (not deleted) per the Risk-3
   rollback plan; then the real move-a-file-and-rescan scenario from the spec's
   acceptance criterion 5.
10. **Full-suite pass:** `npm run check` green; the owner-run Node-script measurements
    from the spec's Verification plan (scan time, second-load time, real-library
    move-and-rescan) actually executed and their numbers written into `HANDOFF.md`;
    `HANDOFF.md` updated; `ROADMAP.md` v0.4.0 marked ✅; `context_check.py` run per
    CLAUDE.md's standing rule.

Each numbered step above is a candidate task-list entry once this plan is approved, per
this skill's own instruction to turn approved ordered steps into a visible task list
with exactly one task in progress and verification as its own explicit task.
