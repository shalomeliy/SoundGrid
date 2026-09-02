# FEATURE_SPEC — Genre column (v0.2.10 → shipped as v0.3.2)

> **Renumbered.** Written and approved as `v0.2.10`, next after `v0.2.9`. While this was
> being implemented, `main` closed `v0.3.0` (Beatgrid & Phase Sync) and reserved `v0.3.1`
> for an unrelated, unbuilt feature — so this shipped as `v0.3.2` instead. Nothing in the
> decisions below changed; only the number. See `HANDOFF.md` and `ROADMAP.md`'s `v0.3.2`
> entry for the actual shipped record.

Status: approved-pending-user-confirmation. Written from a fan-out of product-expert,
architecture-expert, design-expert and QA-expert reviews plus the product owner's own
decisions (both collected live in this session). `SECURITY NOT TRIGGERED` — no auth,
no external input beyond folder names already read by `scanLibrary`, no new dependency.

## Context and observed problem

The library table (`src/app/components/Library.tsx`) shows Title/Artist/Type/BPM/Key/
Time/Load. Genre is not tracked anywhere in the codebase (`grep -i genre src` → zero
hits). The owner organizes `Tracks/` into genre subfolders (`HipHop`, `House`, `Techno`,
`Trance`, `Mizrahi`, plus `Final`, which is not a genre) but that structure is thrown
away at scan time — nothing in the UI reflects which folder a track came from.

## Target user and decision

The product owner (solo DJ, non-programmer), while picking tracks to load to a deck or
filtering the library, needs to see and rely on genre to find the right track fast —
today the only signal is which folder they remember dragging it from.

## User and business outcome

Genre becomes a first-class, visible, editable column, populated automatically from the
folder structure the owner already maintains, so browsing/filtering the library by genre
needs no new manual tagging effort for tracks that are already organized by folder.

## Goal

Add a `genre` value to every track, derived from its parent folder at scan time,
displayed as a column right of Artist, editable via a closed-list dropdown, with
overrides that survive rescans, and with tracks from unrecognized folders surfaced
in one consolidated, informative notice rather than silently blank.

## Non-goals (explicitly out of scope for v0.2.10)

- Genre-aware mix recommendations (`core/recommend.ts` stays BPM/key-only).
- Click-to-sort on any column (none exist today; not introduced here).
- Free-text genre entry — the dropdown is a closed list, by the owner's decision.
- A generalized "Persistence port" implementation (`core/ports/persistence.ts` /
  `platform/persist-idb/`) — reserved for its already-documented v0.4 use (cue points,
  loops). Genre overrides get their own small dedicated IndexedDB store instead, by the
  owner's explicit decision.
- Fixing genre override loss when a file is physically moved between folders and
  rescanned — accepted as known debt (see "Known debt" below), by the owner's decision.
- Redesigning the header badge cluster into a consolidated "N issues" disclosure — the
  new notice is a third badge in the existing style, not a badge-system redesign.

## Assumptions

- A track's genre is fully determined by (a) its immediate parent folder name at scan
  time, overridden by (b) a stored per-track manual choice, in that priority order.
- The known-genre list is a flat, closed, extensible array living in `core/` — no
  hierarchy (no "Deep House is a child of House"), consistent with the owner's "pick
  from a list" decision and the QA finding that a flat list removes runtime match
  ambiguity by construction.
- Folder-name matching does not need edit-distance fuzziness (the owner explicitly chose
  normalized-exact-match + a known-aliases table over open-ended fuzzy matching, to avoid
  false-positive misclassification the product-expert flagged as the more dangerous
  failure mode than a false negative).

## Proposed experience

**Automatic genre on scan.** `scanLibrary` already walks each file's parent directory
(`src/platform/source-fsaccess/library.ts`). For each track, its immediate parent folder
name is normalized (lowercased, separators/whitespace collapsed) and matched against a
normalized index built from the canonical genre list plus a small alias table (e.g.
`"DnB"` → `Drum & Bass`, `"RnB"` → `R&B`). A normalized match needs no explicit alias:
`"HipHop"` and `"Hip Hop"` normalize to the same key. This must resolve all five of the
owner's real folder names (`HipHop`, `House`, `Techno`, `Trance`, `Mizrahi`) correctly —
that is the concrete acceptance bar, not a hypothetical taxonomy.

`Final` is **not** special-cased as a silent exemption (unlike `COMPANION_EXT`, which
hides files, not information from a visible column): it simply doesn't match any known
genre, so tracks from it fall into the same "unrecognized" bucket and notice as any other
non-matching folder name. This keeps the rule uniform — "every folder name is either a
known genre or is named in the notice" — with no hidden list to maintain.

A track added via **+ Files** (`pickTrackFiles`, no parent folder available at all) gets
no derived genre and shows the same dim "–" the Key/BPM columns already use for "no
value" — and is **not** counted in the unrecognized-folder notice, since there is no
folder name to report or to advise renaming.

**The notice.** One consolidated badge per scan, in the same visual slot and style as the
existing "N skipped" / "N unreadable" badges (`Library.tsx` ~L341-372): "N tracks
imported from folders not recognized as a genre." Its tooltip lists which folder names
didn't match and how many tracks each contributed — mirroring the skipped-badge's
per-extension tooltip — so the owner can act (rename the folder) instead of guessing.

**The column.** Plain muted text (matching Artist's treatment), positioned immediately
right of Artist. No color coding (unlike Key, whose color encodes harmonic distance —
genre has no comparable continuous relationship to encode). A track with no genre (either
source) shows the dim dash used elsewhere in the row. Width is reclaimed from Type
primarily and Time secondarily — Title, Artist, BPM, Key and Load are load-bearing
columns this spec does not touch — with the final split confirmed live in the running app
at `libraryTextScale = 1.5` (the widest supported text scale) so the longest realistic
genre label still truncates cleanly inside a 36px row instead of wrapping it.

**Manual override.** Hovering the genre cell reveals a native `<select>` (copying the
existing `keyMode` header-toggle's hover-reveal styling and Settings' select styling),
restricted to the same canonical genre list used for matching — no free text. Selecting a
value commits immediately through `controls.ts` (per the project's "every user action
goes through it" rule), is written to a new small IndexedDB store keyed by track id, and
from then on wins over the folder-derived value for that track (highest priority in the
resolution order above). The click target stops propagation so it doesn't also trigger
row-select or load-to-deck.

**Search.** The existing filter box (`ctl.filteredTracks`) is extended to match against
`genre` as well as path/artist/title, per the owner's decision — typing "techno" finds
tracks whose genre is Techno even if the word isn't in the file path.

## System / data implications

- `Track.genre?: string` (`src/core/types.ts`) — the single resolved value the UI reads,
  same shape as `bpm`/`key`: nothing else in the app needs to know whether it came from a
  folder or an override.
- `src/core/genres.ts` (new, pure, no React/DOM/platform import): the canonical genre
  list, the alias table, and a pure `matchGenre(folderName: string): string | undefined`
  — this is exactly the kind of pure logic CLAUDE.md requires get real unit tests as it's
  touched, and is where dependency-cruiser would flag a violation if platform/app code
  leaked in.
- Derivation runs inside `scanLibrary` (`platform/source-fsaccess/library.ts`), which
  already has the parent-folder name during its existing walk — no new platform port
  needed, it calls the pure `core/genres.ts` matcher the same way other platform code
  already calls pure `core/` helpers.
- A new small IndexedDB store (its own file, sibling to `settings-idb/`, not folded into
  it and not routed through the unused `Persistence` port) holds `trackId -> genre`
  overrides. Loaded once after each scan/add-files and merged onto the resolved tracks;
  written on every manual edit.
- Merge point: after `runScan`/`addFiles` populate folder-derived genre (same place
  `applyTags`'s tag patch already merges in), overlay stored overrides — override wins,
  mirroring the existing "never clobber" merge pattern but with reversed priority (here,
  the *user's* value is the one that must not be clobbered by a later scan).
- `library.ts`'s per-scan progress result (parallel to `skipped: Record<string, number>`)
  gains an unrecognized-genre-folder tally in the same `folderName -> count` shape, so the
  UI badge and tooltip reuse the existing rendering pattern verbatim.

## Acceptance criteria

1. Scanning the owner's real `Tracks` folder assigns the correct genre to tracks in
   `HipHop`, `House`, `Techno`, `Trance`, `Mizrahi`, with zero manual intervention.
2. Tracks under `Final` (and any other non-matching folder) show a dim "–" genre cell and
   are counted in one consolidated header notice naming the folder and count.
3. A track added via "+ Files" shows a dim "–" genre cell and is **not** counted in that
   notice.
4. Hovering a genre cell reveals a dropdown restricted to the canonical genre list only;
   picking a value updates the cell immediately and does not trigger row-select or
   load-to-deck.
5. After a manual override, rescanning the same folder (same files, unmoved) preserves
   the override — it is not replaced by the folder-derived value.
6. Typing a genre name (e.g. "techno") into the existing filter box returns tracks whose
   resolved genre matches, independent of their file path text.
7. `npm run check` stays green; the new `core/genres.ts` has unit tests in `tests/core/`
   enumerating at minimum: exact match, case-insensitivity, the owner's five real folder
   names, a known alias (e.g. "DnB"), an unrecognized name, and an empty/`Final` input —
   all passing before this ships, since a missing test here is exactly the "it's just a
   UI column" gap the QA review flagged as the likely place this gets skipped.

## Loading / empty / error / partial / recovery states

- **Before any scan / no library loaded:** no genre column content to show — same
  pre-scan empty states the table already has (`EmptyState` in `Library.tsx`), untouched.
- **Mid-scan (tags not yet read):** genre is available immediately at scan time (unlike
  BPM/key, which need the later tag pass), so cells populate with the first render of
  `tracks`, not after `applyTags` — no separate "loading" state needed for this column.
- **Unrecognized folder:** dim dash cell + consolidated notice (criterion 2).
- **No folder context (+ Files):** dim dash cell, silently excluded from the notice by
  design (criterion 3) — this is a named exemption from the notice, not an omission, and
  is documented as such in code.
- **IndexedDB unavailable** (private window, blocked storage — already a handled failure
  mode elsewhere in this app, see `reportFailure` in `Library.tsx`): manual overrides
  silently fail to persist is not acceptable per "never skip silently" — the edit must
  still apply for the current session, and the failure needs the same visible treatment
  `settings-idb` already gives storage failures, not a swallowed catch.
- **Recovery:** renaming a folder to a recognized genre name and rescanning moves those
  tracks out of the unrecognized bucket on the next scan, with no special handling needed
  beyond the normal derive-on-scan path.

## Accessibility / security / privacy / operational constraints

- Native `<select>` gives correct keyboard/focus/screen-reader semantics for free
  (design-expert's explicit recommendation over a custom popover), and isn't clipped by
  the table's scroll container the way an absolutely-positioned custom dropdown could be.
- No color-only signal: the dim-dash state for "no genre" reuses the existing, already
  colorblind-safe idiom (shape/opacity, not hue) used by BPM and Key.
- SECURITY NOT TRIGGERED — reaffirmed: folder names are local filesystem strings already
  read by the existing scan; no new external input, no new dependency, no auth surface.

## Verification plan and evidence

- `tests/core/genres.test.ts` (or similarly named) covering the acceptance-criterion-7
  cases — this is the "check that fails without the change" the repo's Definition of
  Done requires or a script/measurement-grade substitute.
- `npm run check` green (tsc + oxlint + depcruise + vitest).
- Browser-verified, numbers recorded (per CLAUDE.md's own standard, echoing the v0.1.7
  BPM/Key measurement pattern): scan the real `Tracks` folder and record how many tracks
  landed in each of `HipHop`/`House`/`Techno`/`Trance`/`Mizrahi`/unrecognized, confirming
  it matches the real folder contents.
- Override-survives-rescan evidence (the QA review's flagged highest-risk path): override
  one track's genre, rescan the same folder, confirm in the running app that the override
  is still shown (not the folder-derived value) — this is the one scenario this feature
  can silently fail at, since nothing else in `runScan` merges by id today.
- A few plain Hebrew lines handed to the owner at the end of the version, per this
  repo's standing convention: what to click (open the Tracks folder, or rescan), what
  should appear (a Genre column with the right value per folder, and — if any folder
  doesn't match — the new notice naming it), and what would mean it's broken (a genre
  column that's blank for tracks that ARE inside a known-name folder, or an override that
  disappears after a rescan of the same, unmoved files).

## Known debt (to record in `HANDOFF.md`, not fixed in v0.2.10)

- Track `id` is derived from scan-relative path (`library.ts`). If the owner manually
  overrides a track's genre and then moves that file to a different folder on disk before
  rescanning, the id changes and the override silently detaches — the track reverts to
  its new folder's derived genre (or unrecognized) with no notice that an override
  existed and was lost. By the owner's explicit decision this is accepted as known debt
  for v0.2.10, to be recorded in `HANDOFF.md`'s "חובות טכניים ידועים" section alongside
  the other path-identity caveats already there, not silently — the same standard applied
  to every other item in that list.

## Open decisions and tradeoffs (already resolved by the product owner this session)

| Decision | Chosen | Rejected alternative |
| --- | --- | --- |
| Matching strategy | Normalized exact match + alias table | Fuzzy edit-distance matching |
| Override persistence | New small dedicated IndexedDB store | Building out the unused `Persistence` port now |
| Filter box scope | Extended to search genre | Left unchanged |
| Override-survives-file-move | Accepted as known debt, documented | Building move-resilient (content-hash) keying now |

No further open product questions remain for this spec. File-level implementation
sequencing (which files change in what order, exact column-width percentages, exact
IndexedDB schema) is deliberately left to the plan phase (`architecture-plan` skill),
per this skill's own rule that a specification must not become a file-by-file plan.
