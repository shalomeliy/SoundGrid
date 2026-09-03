# PLAN — Genre column (v0.2.10 → shipped as v0.3.2)

> **Renumbered** — see the note at the top of `FEATURE_SPEC.md`. Shipped as `v0.3.2`.

Implements the approved `workshop-output/FEATURE_SPEC.md`. This file defines *how*, in
what order, grounded in the repository as it exists today; it does not reopen any
product decision already made in the spec.

## 1. Current architecture and relevant data flow

- `platform/source-fsaccess/library.ts:scanLibrary` walks the chosen folder recursively,
  building each `Track` with `id`/`path` = `${prefix}${name}` (prefix accumulates as
  `"Techno/"`, `"Techno/2020/"`, …), `kind` = extension. Non-audio, non-companion
  extensions are tallied into `ScanResult.skipped` (never silently dropped). No parent
  folder name is retained past this point today — it's implicit in `path`.
- `Library.tsx:runScan` calls `scanLibrary`, immediately `setLibrary({ tracks, skipped,
  boot: 'loaded', ... })` (tracks visible before any tags exist), then `applyTags` runs
  `readLibraryTags` (byte-range ID3/Vorbis/MP4 reads) which patches `bpm`/`key`/
  `camelot`/`artist`/`title`/`album` onto tracks in batches, "existing value wins" merge
  (`patch.get(t.id)` → `{ ...p, ...t, bpm: t.bpm ?? p.bpm }` — note: spread order means
  every OTHER tag field is `p`-wins/`t`-wins per field individually; only `bpm` is
  explicit `??`, the rest overwrite unconditionally since `t` fields for those are
  usually still empty at this point).
- `Library.tsx:addFiles` (`pickTrackFiles`, no folder context) merges new tracks into the
  existing array by `id`, does not replace it.
- `app/state/store.ts` holds `library.tracks: Track[]`, `library.skipped: Record<string,
  number>`, `library.unreadable: number` — the existing "never skip silently" counters.
- `controls.ts:filteredTracks()` filters `library.tracks` by `path`/`artist`/`title`
  substring match against `library.query`. This is the single search choke point the UI
  reads from.
- `settings-idb/store.ts` is the house style for a small `idb-keyval`-backed store:
  module-level singleton, explicit try/catch around the IndexedDB call, failures surfaced
  rather than swallowed (there via `SettingsIssue`, here via the app's existing `notice`
  banner — see §4).
- `.dependency-cruiser.cjs` enforces: `core/` may import nothing from `app/`/`platform/`
  or React; `platform/` may reach into `app/` only as a tracked `warn` (not to be
  imitated). A pure `core/genres.ts` module and a `platform/*-idb/` store both fit inside
  the existing rules with no waiver needed.

## 2. Proposed thin end-to-end slice

Folder-derived genre first, fully working and verified against the owner's real library
(steps 1–5 below), *then* the notice badge, *then* the column/UI, *then* the override +
persistence. Each stage leaves the app in a shippable state — this is why `Track.genre`
is optional throughout and every consumer added is additive.

## 3. Exact files to add or change

| File | Change | Responsibility |
| --- | --- | --- |
| `src/core/genres.ts` (new) | Canonical `GENRES: string[]`, `GENRE_ALIASES: Record<string,string>`, pure `matchGenre(folderName: string): string \| undefined`, pure `parentFolderName(prefix: string): string \| undefined` | The only place genre-matching logic lives; zero platform/React imports |
| `tests/core/genres.test.ts` (new) | Unit tests per acceptance criterion 7 | The "check that fails without the change" |
| `src/core/types.ts` | Add `genre?: string` to `Track` | Data model |
| `src/platform/source-fsaccess/library.ts` | `scanLibrary`: derive `prefix`'s last segment via `parentFolderName`, call `matchGenre`, set `track.genre`; accumulate unmatched names into new `ScanResult.unrecognizedGenre: Record<string, number>` | Where the folder name is already known during the walk |
| `src/app/state/store.ts` | Add `library.unrecognizedGenre: Record<string, number>` (init `{}`); extend `NoticeSource` with `'library'` | State shape + notice ownership |
| `src/app/components/Library.tsx` | Pass `unrecognizedGenre` through `runScan`; render the third header badge; add Genre `<Th>`/`<td>`, re-percentage columns; hover-reveal `<select>`; load+merge overrides after scan/addFiles | UI |
| `src/controls.ts` | `filteredTracks()` also matches `genre`; new `setTrackGenre(trackId: string, genre: string)` — the choke point for this user action | Central action dispatch |
| `src/platform/genre-overrides-idb/store.ts` (new) | `getGenreOverrides(): Promise<Map<string,string>>`, `setGenreOverride(trackId, genre): Promise<void>`, IndexedDB failure caught and surfaced, never swallowed | Override persistence |
| `package.json` | `"version": "0.2.10"` | Version-in-step invariant |
| `HANDOFF.md` | Current-version line, the known-debt bullet (override lost if file moves folder before rescan) | Standing project record |
| `ROADMAP.md` | New `## v0.2.10` section, marked ✅ when done | Standing project record |
| `CLAUDE-HE.md` | Unchanged — this plan does not touch `CLAUDE.md`, so the "move together" rule doesn't trigger | — |

No new `core/ports/` interface, no `platform/persist-idb/`: both were explicitly rejected
in the spec's decision table in favor of a small dedicated store, matching the
`settings-idb` precedent rather than the unbuilt `Persistence` port.

## 4. API / type changes, including failure behavior

- `Track.genre?: string` — optional, so every existing consumer (waveform, deck load,
  mapping, recommend) is untouched and needs no change.
- `ScanResult` gains `unrecognizedGenre: Record<string, number>`, parallel to the
  existing `skipped` field — same shape, same reasoning, so `Library.tsx` handles it with
  the same pattern already used for `skippedTotal`.
- `NoticeSource` (`app/state/store.ts`) gains `'library'` — a per-source notice slot
  already designed to be added to ("only they clear it"). Used when
  `setGenreOverride` throws: the in-memory value still applies for the session (never a
  silent no-op), and `setNotice({ text: '...', tone: 'warn', source: 'library' })`
  reports that it did not persist, mirroring exactly how `settings-idb` already handles
  this failure mode for settings.
- `setTrackGenre(trackId, genre)` (new, in `controls.ts`): updates `library.tracks` in the
  store synchronously (UI reflects the change immediately), then awaits
  `setGenreOverride`; on rejection, keeps the in-memory value and sets the `'library'`
  notice instead of throwing into an unhandled rejection.

## 5. UI state model and data dependencies

- Genre is part of `Track`, so it rides along with `library.tracks` — no separate
  "genre state" to keep in sync.
- `library.unrecognizedGenre` is scan-scoped, replaced wholesale each `runScan` exactly
  like `skipped` is today (not merged/accumulated across scans).
- Override merge happens in two places, both in `Library.tsx`, both *after* the
  fast/synchronous folder-derived `setLibrary({ tracks, ... })` that already gives
  instant paint: once in `runScan` (right after the existing `setLibrary` at line ~208),
  once in `addFiles` (right after its `setLibrary` at line ~239) — `getGenreOverrides()`
  resolves quickly (one small IndexedDB read), then a second `setLibrary` patches
  `t.genre = overrides.get(t.id) ?? t.genre` onto the current track list. This is the
  same two-pass shape `applyTags` already uses (fast list, then a fill-in patch), so nothing
  new is being taught to this component's data flow — just a second independent fill-in
  source.
- The `<select>` in each Genre cell reads its options from `core/genres.ts`'s `GENRES`
  list directly — no store round-trip needed for the option list itself.

## 6. Tests at the cheapest meaningful layer

- `tests/core/genres.test.ts` — the only layer this feature can get real, fast,
  deterministic coverage at (pure functions, no browser/file dependency). Minimum cases,
  per spec acceptance criterion 7:
  - `matchGenre('HipHop')`, `matchGenre('House')`, `matchGenre('Techno')`,
    `matchGenre('Trance')`, `matchGenre('Mizrahi')` → each resolves correctly (the
    owner's real five folder names — the concrete bar the spec sets, not a hypothetical).
  - Case-insensitivity: `matchGenre('techno')` → same as `matchGenre('Techno')`.
  - A known alias not resolvable by normalization alone: `matchGenre('DnB')` →
    `'Drum & Bass'`.
  - Unrecognized: `matchGenre('Final')` → `undefined`; `matchGenre('')` → `undefined`;
    `matchGenre('Some Random Folder')` → `undefined`.
  - `parentFolderName('')` → `undefined` (root-level file); `parentFolderName('Techno/')`
    → `'Techno'`; `parentFolderName('Techno/2020/')` → `'2020'` (documents, deliberately,
    that only the *immediate* parent is consulted — matches the spec, and is itself worth
    a test since it's the kind of "wait, why doesn't this nested folder work" question
    the owner could otherwise ask during verification).
- Everything past this (scan integration, override persistence, the UI) has no automated
  coverage available in this repo (no `AudioContext`/File System Access shim exists here,
  and building one is out of scope for a small column feature) — verified instead by the
  browser-verified, numbers-recorded steps in §8 and the spec's "Verification plan".

## 7. Risks, rollback, deliberate non-goals

**Risks**
- Column re-percentaging is the one place a numeric mistake reproduces as the exact
  "dead space" bug the `table-fixed` comment in `Library.tsx` already documents once. The
  starting split proposed in §8 step 7 must be confirmed live, not shipped on faith.
- The override-merge is new logic with no automated test harness behind it (per §6) — the
  browser-verified override-survives-rescan check in §8 is not optional colour, it is the
  only verification this specific failure mode gets.
- IndexedDB write failure inside `setTrackGenre` is exercised by code review, not by an
  automated test (forcing a real IndexedDB failure in this environment isn't practical) —
  this is stated as a real limitation, not hidden as if it were covered.

**Rollback**
- Every change is additive (`genre?` optional field, new files, one new `NoticeSource`
  value, one new store). Reverting the commit(s) for this version removes the feature
  cleanly; no data migration exists to unwind, since the override store is new and
  independent of `settings-idb`.

**Deliberate non-goals** (restated from the spec, so the plan doesn't quietly reintroduce
them): no genre-aware mix recommendations, no column sorting, no free-text genre entry,
no `Persistence`-port implementation, no fix for override loss when a file moves folders
before a rescan (documented as known debt instead).

## 8. Ordered implementation steps, with verification after each

1. **Add `core/genres.ts`** (taxonomy, aliases, `matchGenre`, `parentFolderName`) +
   **`tests/core/genres.test.ts`**.
   *Verify:* `npm test` green, including the owner's five real folder names.
2. **Add `Track.genre?: string`** to `core/types.ts`.
   *Verify:* `npm run check` green (purely additive, no consumers yet).
3. **Wire derivation into `scanLibrary`**: compute the immediate parent via
   `parentFolderName(prefix)`, call `matchGenre`, set `track.genre`; accumulate
   `ScanResult.unrecognizedGenre`.
   *Verify:* `npm run check` green; no UI change yet so nothing new on screen.
4. **Add `library.unrecognizedGenre`** to the store, extend `NoticeSource` with
   `'library'`.
   *Verify:* `npm run check` green.
5. **Thread `unrecognizedGenre` through `runScan`** into `setLibrary`.
   *Verify, in the running app:* scan the real `Tracks` folder, confirm (via a temporary
   `console.log` or the store devtools) the count matches the real `Final` folder's track
   count and no others — this is the first real signal the derivation logic is correct
   end-to-end, before any UI exists to show it.
6. **Add the third header badge** (unrecognized-genre notice), same style as
   skipped/unreadable, tooltip listing folder → count.
   *Verify, in the running app:* the badge text and tooltip match what step 5 already
   confirmed.
7. **Add the Genre column**: `<Th>`/`<td>` between Artist and Type; re-percentage widths
   — starting proposal Title 25 / Artist 27 / **Genre 7** / **Type 4** / BPM 10 / Key 10
   / **Time 7** / Load 10 (sums to 100, moves 7 points off Type+Time only, per the
   design-expert's constraint); plain muted text, existing dim-dash for missing.
   *Verify, in the running app:* real scan renders correct genre per folder; check the
   layout at `libraryTextScale` = 1.0 and 1.5 specifically (Settings screen) — the longest
   realistic label must truncate, not wrap the 36px row. Adjust the percentages here if it
   doesn't, before moving on.
8. **Extend `filteredTracks`** to match `genre`.
   *Verify, in the running app:* typing "techno" in the filter box returns Techno-genre
   tracks.
9. **Add `src/platform/genre-overrides-idb/store.ts`** (`getGenreOverrides`/
   `setGenreOverride`, failure caught and returned/thrown for the caller to surface, never
   swallowed).
   *Verify:* `npm run check` green.
10. **Add `controls.ts:setTrackGenre`**; wire the hover-reveal `<select>` in the Genre
    `<td>` (options from `GENRES`), `stopPropagation` on both click and change so it
    doesn't trigger row-select or load-to-deck; load+merge overrides after scan/addFiles
    per §5.
    *Verify, in the running app:* hovering reveals the dropdown; picking a value updates
    the cell immediately; double-clicking the dropdown does not load the track to a deck.
11. **Override-survives-rescan check** (the QA-flagged highest-risk path): override one
    track's genre, rescan the same folder (files unmoved), confirm the override is still
    shown, not replaced by the folder-derived value.
    *Verify, in the running app:* exactly this sequence, numbers/observation recorded.
12. **Docs**: bump `package.json` to `0.2.10`; update `HANDOFF.md` (current-version line,
    the known-debt bullet); add the `## v0.2.10` section to `ROADMAP.md`; run
    `python scripts/context_check.py` and act on its verdict.
    *Verify:* `npm run check` green (this is what actually enforces the doc invariants:
    version-in-step, handoff-size, path-exists, no-conflict-markers).
13. **Independent review** via `.claude/agents/change-reviewer.md`, then hand the owner
    the short Hebrew "how to check this yourself" instructions per the repo's Definition
    of Done.

Steps 1–4 have no user-visible effect and can be committed together as one unit if
convenient; steps 5 onward each change something observable and should get their own
verification pass before moving to the next, per this repo's "commit after every unit
that works and builds" convention.
