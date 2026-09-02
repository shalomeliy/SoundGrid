# SoundGrid — project instructions

A Hebrew copy of this file lives at [`CLAUDE-HE.md`](CLAUDE-HE.md), for the project
owner, who is not a programmer. **This file is the authoritative one** — it is what gets
loaded automatically.

> **Standing rule: any edit to one of the two files goes into the other in the same
> commit.** They must never drift apart. If you find they already have, reconcile them
> before continuing with the work.

## Product purpose

A browser-based DJ system: Serato-style two-deck mixing that plays the music already on
the user's computer, driven by a hardware controller (Pioneer DDJ-FLX4). Built from
scratch on the open web platform — Web Audio, Web MIDI, File System Access — with
**zero code, assets, or data taken from Serato, rekordbox, or any other commercial
product**. Reading tags out of the user's own files is allowed; copying their code is not.

The long-term goal (`docs/architecture/directions.md`) is Windows + Mac desktop builds
via Tauri around v1.0, so nothing in `core/` may assume the browser.

Chromium desktop only — Web MIDI, File System Access and per-device audio output exist
nowhere else today. Plan layout for ~710 CSS px of height (the user's 1536×710 viewport),
and remember everything renders ~24% smaller physically than its CSS number on that
screen — multiply any CSS size by 0.76 to know what they actually see.

## Stack

- React 19 + TypeScript (strict — on in all three tsconfigs since v0.2.7, and
  pinned by `tests/repo/tsconfig-strict.test.ts`) + Vite 8, Tailwind 4, zustand. No router, no backend —
  a pure static SPA. **Zero runtime server dependency** is a deliberate constraint.
- Three layers, enforced by dependency-cruiser (`.dependency-cruiser.cjs`), not by convention:
  - `src/core/` — pure TS. No React, no DOM, no `AudioContext`, no Web MIDI. Types,
    constants, mapping, recommend, and the port interfaces in `core/ports/`.
  - `src/platform/` — the implementations behind those ports: `audio-webaudio/`,
    `source-fsaccess/`, `transport-webmidi/`, `analyzer-js/`, `capabilities.ts`,
    `clock-audio.ts`.
  - `src/app/` — React only: `App.tsx`, `components/`, `hooks/`, `state/store.ts`.
- `src/controls.ts` is the choke point: **every** user action goes through it — mouse,
  keyboard, MIDI, and later AI. It sits outside the three layers on purpose.
- Cross-file imports use the `@/*` alias, never `../`. A relative import hides which
  layer it crosses; that is what made the old layering invisible (`f8f5cf8`).
- Persistence today is `idb-keyval`, holding the library folder handle only.

## Before implementation

1. **Read `HANDOFF.md` first** — current version, next step, open decisions, known debt.
   Then the relevant version section of `ROADMAP.md`, then `git log --oneline -5`.
2. **Start the dev server before anything else**: `preview_start` with `soundgrid-dev`
   from `.claude/launch.json`. Never `npm run dev` through Bash — that server does not
   survive and the browser tools cannot reach it. The user tests the running app in
   their own Chrome in parallel, so a session that starts without a server costs them
   its whole first stretch.
3. Navigate with `codegraph_explore` (`.codegraph/` exists here) instead of broad
   grep/read.
4. Check `docs/architecture/directions.md` before adding a platform dependency — the
   port is probably already specified there.
5. Write goal, non-goals, acceptance criteria and a verification plan before touching
   code. Fan out to the read-only expert subagents in `.claude/agents/` (product,
   architecture, design, QA; security whenever a change touches the user's files or
   library) and merge them into one spec. The user approves every product decision.
6. **Explain the change in Hebrew before writing it.**

## Engineering boundaries

### Never skip silently — the project's central rule

The user picked Techno, saw 42 tracks, and there were 47 files in the folder. The scan
walked past what it did not recognise and the gap was invisible (`59c5fe5`). This is
SoundGrid's hard invariant, and it outranks convenience:

- Anything dropped, ignored, degraded or fallen back to is **surfaced in the UI**, and
  named — which formats, how many.
- What is hidden on purpose is hidden by a **named set**, not by omission. `COMPANION_EXT`
  in `library.ts` hides `.serato-stems`/`.asd`/`.reapeaks`/`.ovw`, and that is exactly
  why the "N skipped" badge does not count them.
- A `catch` that swallows, an early `return`, a default that quietly substitutes — each
  one has to answer: *how does the user find out?*
- It reaches past the library. A missing capability degrades **visibly** (`Capabilities`,
  §3 of `directions.md`): no feature crashes when one is absent, and none pretends to work.

### The rest

- Keep `core/` pure. Platform dependency → interface in `core/ports/`, implementation in
  `platform/`. `npm run check` fails otherwise.
- New user action → add it to `controls.ts`, call it from both the UI and
  `transport-webmidi/manager.ts:dispatch`. New MIDI action → `ControlAction` in
  `core/mapping/mapping.ts` + a case in `dispatch` + an entry in `mappings/flx4.ts`.
- The audio engine is imperative and lives outside React. The store holds serializable
  state only.
- **Read the user's files; never write to them.** `tags.ts` does byte-range reads only,
  never decodes a whole track into memory, never writes back.
- One deliberate outstanding warning: `transport-webmidi/manager.ts` writes to the store
  and calls `controls.ts` directly instead of emitting `ControlAction`s through the port.
  It is a `warn` so it stays visible — don't copy the pattern, and don't silence the rule.
- Comments explain **why an invariant exists**, not what the code already says. See the
  `position:absolute` note on the waveform canvas and the WAV chunk-seek note in
  `tags.ts` — each records a bug that comes straight back if someone "simplifies" it.
  Write new ones the same way.
- Never break the stereo fallback or the keyboard path. Chromium-only is a platform
  decision, not an excuse.
- Prefer simple and maintainable over clever. Don't rewrite unrelated areas.

## Definition of done

**`vitest` landed in v0.2.1** — `npm test`, and `npm run check` runs it. What lives in
`tests/repo/` are invariants about the **repository as a system**: doc size, version
drift, dead paths, unresolvable SHAs, the two `CLAUDE` files moving together, no
file carrying conflict markers, and no calibration constant reaching the Settings
screen. The rule
they come from: **every bug caught once becomes a permanent check.** When you fix
something a test could have caught, add the test in the same commit.

**The audio engine and the library still have no automated tests**, and a runner does
not conjure them: the engine needs an `AudioContext`, the library needs the user's real
files, and faking either would test the fake. (`tests/core/` is the counter-example and
the pattern to copy — v0.2.2 pulled the scratch maths out into `core/scratch.ts` and got
12 real cases out of it. The rule below is what that move was for.) So "a check that fails without the change" still
usually means an explicit, recorded verification. The v0.1.7 pattern is the standard: a
small Node script run directly against `C:\Users\Shalom\Music\Tracks` with a minimal
`File` shim, numbers written down (BPM 96.9%, Key 97.2%, Duration 100%, 0.6s over 360
files). Pure logic in `core/` — mapping, `recommend`, `parseKey` — has no such excuse and
should get real tests as it is touched.

A change is done only when:

- **`npm run check` is green** — `tsc -b` + `oxlint` + `depcruise` + `vitest run`. Run it
  before every commit.
- **A check exists that would fail without the change**, was actually run, and its result
  is recorded — a script, a measurement against the real library, or a browser-verified
  observation with numbers. "It builds" is not verification.
- It was verified **in the running app**, not only in the type checker. Browser-pane
  screenshots do not work in this environment; `javascript_tool` for DOM measurement and
  `read_console_messages` for errors do, and the user looks at their own Chrome.
- **The user has been told, in a few plain lines, how to check it themselves.** See below.
- **`HANDOFF.md` is updated** — status, what was done, what's next, any new debt. A
  session does not close without it. If it isn't written there, it wasn't handed over.
- `ROADMAP.md` is marked ✅ when a version closes.
- **The diff has had an independent review** from `.claude/agents/change-reviewer.md`.
- The commit message starts with `vX.Y.Z:` and says *what was wrong and how it was found*,
  not just what changed — `59c5fe5` and `f8f5cf8` are the bar.
- The user can explain the decision, the tradeoff, and the remaining risk.
- If this file changed, `CLAUDE-HE.md` changed with it (and vice versa).

Never weaken or delete a check to make a verification loop pass.

### Hand the user a way to check it

Every time a version, a sub-version, or any self-contained piece of coding is finished,
write the user a few short lines in Hebrew: **how to verify this specific thing in the
running app.** Concrete steps, in the order they'd do them, and what they should see:

- where to click / what to load (e.g. "pick the Techno folder"),
- what should appear (e.g. "the header shows `1 skipped · mp4`"),
- and the one thing that would mean it's broken.

Keep it to a few lines, no jargon. My own verification proves the code works; this is
what lets the owner confirm it, and they are not a programmer — "verified" means nothing
to them until they can reproduce it.

## Context discipline

Why this section exists: every turn re-reads everything written before it, so cost grows
with **conversation length**, not with task difficulty. State must live in files, and
conversations must be allowed to end.

- **`HANDOFF.md` is read first in every conversation**, and is the only source of truth
  between them.
- **Run `python ~/.claude/tools/context_check.py` at the end of every
  version / sub-version** — once the checks are green, `HANDOFF.md` is updated and the
  work is committed. Act on the verdict, and **never ask the user whether to continue
  here or open a new conversation**; that question is what this measurement replaces.
  🟢 → start the next version here without asking. 🟡 → the version is closed and
  verified, so this is the moment: say the conversation should close. 🔴 → stop, say it
  must close now. Thresholds live in the script (`TURNS_WATCH/CLEAN`, `MB_WATCH/CLEAN`) —
  tune them there, never by judgment in the moment.
- **🟡/🔴 always means a new conversation, never `/clear`.** Both wipe live context
  equally, so tokens are not what decides. `/clear` keeps appending to the same transcript
  file, so it does **not** reset `context_check.py`'s counters — keep clearing and it
  reads 🔴 while context is actually empty. One transcript per version also keeps
  `--resume` and `/rewind` usable. `/clear` is only for throwaway exploration with no
  record worth keeping. (The old "קריטריון CLEAR" section in `HANDOFF.md` was superseded
  by this rule and removed in the 2026-08-29 doc split.)
- Prefer a subagent for read-only exploration ("where is X used", "does Y exist") so its
  reading stays out of this conversation's context.
- Don't dump whole files or full command output into the transcript when a targeted
  range or a count answers the question.

## Doc map

Each doc answers one question and stays out of the others' way:

| Question | File |
| --- | --- |
| What's in flight **right now** — version, what's open, next step, known debt | `HANDOFF.md` |
| What was built in a **closed** version, and what was measured there | `docs/handoff/<version>.md` |
| What gets built **next**, in what order, and why the order changed | `ROADMAP.md` |
| **Where everything lives** in the source tree | `docs/architecture/map.md` |
| **Long-term principles** — the ports, `core/` purity, the AI-layer contract, differentiation vs Serato/rekordbox, hardware targets | `docs/architecture/directions.md` |
| **Serato's on-disk formats** (database V2 / crate TLV, GEOB Markers2/BeatGrid/Autotags/Overview) | `docs/reference/serato-formats.md` |
| What the app is, for someone who just found the repo | `README.md` |
| What's allowed while working | this file (Hebrew: `CLAUDE-HE.md`) |

**The docs are checked, not trusted.** The split of 2026-08-29 came first: `HANDOFF.md`
had reached 43.9KB and `ROADMAP.md` 34.6KB — both append-only, both read at the start of
every conversation, so together the largest standing context cost in the repo. Worse than
the size, the file had gone false: its header announced "v0.2.0b written" while **four of
the six items in its own plan had never been done**, buried in one block out of twenty. A
file that grows stops being read, and a file that isn't read starts to lie.

So `HANDOFF.md` holds **the present only**, under a **15,000-byte budget** stated at the
top of the file. When a version closes, its block **moves** to `docs/handoff/<version>.md`,
which carries both the original scope and the outcome, and the root file keeps a link.
**Anything still open stays in `HANDOFF.md`** — the archive is for the record, not for
hiding work.

### These are checks now, not conventions (v0.2.1)

`tests/repo/` runs inside `npm run check`, so the docs fail the gate exactly like the code:

- **The 15,000-byte budget is enforced.** When it fails, move a closed block out to
  `docs/handoff/<version>.md`. **Never raise the budget.**
- **A path named in a doc must exist**, in both forms the docs write it: a full `src/…`
  path, or a bare `dir/name` as in the tree map. If you deliberately name a dead path to
  explain a move, mark the line `<!-- dead-path -->`. Named exemption, not omission — the
  same rule as `COMPANION_EXT`.
- **`package.json`'s version and `HANDOFF.md`'s "גרסה נוכחית" line are one fact.** Change
  them together, and give the version a row in `ROADMAP.md`.
- **A commit SHA quoted in a doc must resolve.** The docs argue from history; a SHA that
  resolves to nothing reads as evidence and is not.
- **The two `CLAUDE` files must move in the same commit** — the rule at the top of this
  file finally has something behind it.
- **No tracked file carries conflict markers** (v0.2.4). This file sat on `main` with two
  unresolved regions in it for three versions while `npm run check` stayed green: the five
  checks above all read the docs for *meaning*, and none read them for *damage*.
- **No calibration constant reaches the Settings screen** (v0.2.5). `PLATTER_SIZE`,
  `POSITION_EPSILON_SEC`, `DECLICK_SEC` and the rest each pin a bug that is already
  fixed; a control for one is a polite way to let the user break the app for
  themselves. That was a paragraph in `ROADMAP.md`, which is to say it was nothing.
  The check strips comments first, so `core/settings.ts` can still *name* them in the
  paragraph explaining the exclusion — a named exemption, not an omission.

**Still a convention, because no check can express it: "the status line tells the truth."**
The 2026-08-29 failure — a header announcing "v0.2.0b written" while four of the six items
in its own plan were never done — needs a human reading the plan against the code. The
split is what makes that reading possible; it is not a substitute for it.

`ROADMAP.md` is ~32KB and append-only, and was left alone on purpose — its version specs
are read *selectively*, one section at a time, so it does not carry the same
per-conversation cost. It has no budget test yet.

## Useful commands

```bash
npm run check      # tsc -b + oxlint + depcruise + vitest — the gate before every commit
npm run build      # type-check + static bundle into dist/
npm run lint       # oxlint alone
npm run arch       # dependency-cruiser alone — the layer rules
npm test           # vitest alone — tests/repo/ invariants + tests/core/ unit tests
```

```bash
python ~/.claude/tools/context_check.py
```

The tool lives in the **global** `.claude` directory, not in this repo, so it works
from every project. Written with `~` rather than the absolute Windows path it used to
carry, because v1.0 targets a Mac build too (`directions.md`) and `C:/Users/...` does
not exist there. PowerShell, Git Bash and a Mac shell all expand `~`; plain `cmd.exe`
does not, so spell the home directory out there.

Dev server: `preview_start` with `soundgrid-dev` (port 5173) — **not** Bash.

There is no formatter and no CI in this repo — don't assume anything checks the branch.
`npm run check` is the whole gate, and it only runs when someone runs it.
