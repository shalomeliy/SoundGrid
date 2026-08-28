# Serato — file layout & data formats (interop reference)

Observed from a real install on this machine: **Serato DJ Pro 3.3.5** (Windows),
library at `C:\Users\Shalom\Music\_Serato_\` with 410 tracks + crates, and tagged
audio under `C:\Users\Shalom\Music\Tracks\`.

**Scope / legal.** This documents *formats* so SoundGrid can eventually do a
**read-only import** of the user's own beatgrids / cues / crates (ROADMAP v0.16),
and so a desktop build (post‑v1.0) knows what a serious DJ app ships. We copy **no
Serato code and no Serato assets**. Everything below is reverse‑engineered from the
user's own data files; the container format is also publicly documented by the
`Holzhaus/serato-tools` and `beet-serato` communities.

---

## 1. Where Serato keeps things

Serato writes a `_Serato_` folder at the root of every drive that holds tracks, plus
one in `~/Music`. The `~/Music\_Serato_` copy is the "home" library.

```
_Serato_/
  database V2            main library index (binary TLV) — every known track
  Subcrates/*.crate      crates (binary TLV). "A%%B.crate" = crate B nested under A
  SmartCrates/*.scrate   smart-crate rule sets (binary TLV; empty on this install)
  neworder.pref          crate order + column layout (UTF-16BE text, [record]/[crate] lines)
  window.pref            per-view sort + column widths (UTF-16BE text)
  history.database       play history index (same TLV)
  History/Sessions/*.session   one file per DJ session (played tracks, timestamps)
  Recording/             recorded sets (.aiff/.ogg)
  Metadata/Spotify/*.{xml,ovb,jpg}   streaming-service metadata + art cache
  Effects/*.json         favourited / saved FX banks (plain JSON)
  DJ.gai, DJLite.gai     grid-analysis index blobs (16 KB each)
  DBV2-legacy.zip        auto-backup of a previous database V2
_Serato_Backup/          full copy of the above, refreshed on launch
```

Crate nesting is encoded in the **filename**: `2025%%Techno.crate` = "Techno" inside
"2025". `%%` is the separator.

---

## 2. The container format (`database V2`, `*.crate`, `history.database`)

A flat stream of **TLV** chunks, no header magic:

| bytes | meaning |
| --- | --- |
| 4 | tag — 4 ASCII letters |
| 4 | length — **big-endian** uint32 |
| N | body |

The **first letter of the tag** gives the body type:

| prefix | type | encoding |
| --- | --- | --- |
| `v` | version | UTF‑16BE string (e.g. `vrsn` → `2.0/Serato Scratch LIVE Database`) |
| `o` | container | nested TLV chunks (`otrk` = one track, `ovct` = one column, `osrt` = sort) |
| `t` | text | UTF‑16BE string |
| `p` | path text | UTF‑16BE string, `/`-separated, **relative to the volume root** (no drive, no leading `/`) |
| `u` | unsigned int | big-endian, width = length (usually 4) |
| `s` | signed / small int | big-endian (seen as 2 bytes) |
| `b` | boolean | 1 byte `00` / `01` |

### `database V2` layout

```
vrsn
otrk { ...fields... }   × 410
```

### `otrk` field dictionary (from this library)

| tag | meaning | notes |
| --- | --- | --- |
| `ttyp` | file extension | `mp3`, `m4a`, … |
| `pfil` | file path | relative to volume root |
| `tsng` | title | |
| `tart` | artist | |
| `talb` | album | |
| `tgen` | genre | |
| `tcom` | comment | |
| `tgrp` | grouping | |
| `trmx` | remixer | |
| `tlbl` | label / publisher | |
| `tcmp` | **composer** field — this install stores the crate/"TeaMix …" tag here | |
| `ttyr` | year | |
| `tbpm` | BPM | text, e.g. `99.50` |
| `tkey` | musical key | text, e.g. `5A` (Camelot) |
| `tlen` | duration | text `m:ss` |
| `tbit` | bitrate | text |
| `tsmp` | sample rate | text |
| `tsiz` | file size | text |
| `tadd` / `uadd` | date added | unix epoch (text and int copies) |
| `utme` | file mtime | unix epoch |
| `utpc` | play count | int |
| `ulbl` | track colour | int `0x00RRGGBB` (`16777215` = white = "no colour") |
| `udsc`, `utkn`, `ufsb`, `sbav` | internal (disc#, token, subframe, avail.) | |
| `bbgl` | beatgrid locked | |
| `bply` | played this session | |
| `bmis` | file missing | |
| `bcrt` | corrupt | |
| `biro` | read-only | |
| `bovc` | overview computed | |
| `bhrt`, `bkrk`, `blop`, `bitu`, `bwlb`, `bwll`, `buns`, `bstm` | misc flags (hi-res, key-lock allowed, loops, iTunes, white-label, unsupported, stems…) | |

### `*.crate` layout

```
vrsn  → "1.0/Serato ScratchLive Crate"
osrt  → { tvcn: <column>, brev: <00|01 reversed> }        default sort
ovct  → { tvcn: <column name>, tvcw: <width as text> }    × one per visible column
otrk  → { ptrk: <path relative to volume root> }          × one per track, in crate order
```

Crates store **only the path**; all metadata is resolved via `database V2`.
Smart crates (`.scrate`) add rule chunks (`trpt` rule type, `trmt` match, `trrv`
value) — not present on this install.

---

## 3. Per-file metadata — Serato tags inside the audio file

This is the important one for SoundGrid: everything Serato knows about a track's
**analysis** also lives in the file, as **ID3v2 `GEOB`** frames (MP3) / atoms
(MP4) / Vorbis comments (FLAC). SoundGrid can read these straight from the user's
own files with zero dependency on `_Serato_`.

`GEOB` frame body = `encoding(1)` + `mime\0` (`application/octet-stream`) +
`filename\0` (empty) + `description\0` + payload.

| `description` | payload |
| --- | --- |
| `Serato Autotags` | `01 01` + ASCII, `\0`-terminated fields: **BPM**, **auto-gain dB**, (gain dB #2). e.g. `105.00`, `-1.424`, `0.000` |
| `Serato BeatGrid` | `01 00` + `count`(u32 BE) + markers. **Non-terminal** marker = `position`(float32 BE, seconds) + `beatsToNext`(u32 BE). **Terminal** marker = `position`(float32) + `bpm`(float32). Reconstruct grid by interpolating between markers. |
| `Serato Markers2` | `01 01` + **base64** (may contain embedded `\0` / newlines — strip them, pad to /4). Decoded = `01 01` + entries. Entry = `name\0` + `len`(u32 BE) + payload: <br>• `COLOR` → `00 RR GG BB` (track colour) <br>• `CUE` → `00` + `index`(u8) + `pos_ms`(u32 BE) + `00` + `RR GG BB` + `00 00` + `name\0` <br>• `LOOP` → `00` + `index`(u8) + `start_ms`(u32) + `end_ms`(u32) + `FF FF FF FF 00` + `RR GG BB` + `00` + `locked`(u8) + `name\0` <br>• `BPMLOCK` → `00|01` |
| `Serato Markers_` | **legacy v1** cue/loop table (binary, fixed-width entries, RGB). Still written for backward compat; prefer `Markers2`. |
| `Serato Overview` | waveform preview — 1 byte per column (~`datalen` cols). Low nibble ≈ amplitude bucket, high nibble ≈ frequency/colour band. Serato's own preview res; SoundGrid computes its own peaks so this is optional. |
| `Serato Analysis` | `02 01` — analyser version the file was last processed with. |

MP4/M4A: same payloads inside a `----:com.serato.dj:<name>` freeform atom, base64‑wrapped.
FLAC/OGG: same, as a `SERATO_<NAME>` Vorbis comment, base64.

Cue/loop positions are **milliseconds from file start** (not accounting for MP3
encoder delay — Serato applies its own ~26 ms fudge; expect small offsets).

---

## 4. Desktop-app observations (`C:\Program Files\Serato\Serato DJ Pro\`)

Not needed for the web app, but relevant when we build the desktop client
(ROADMAP v1.0 mentions Tauri):

- **Qt 6 + QML** front-end (`Qt6Quick`, `Qt6Qml`, `Qt6Multimedia`, `Qt6WebEngine`,
  `Qt6WebSockets`), C++ core. UI assets packed in `bundle1` (248 MB) / `bundle2`
  and `*_resources.bin`.
- Audio/DSP: `iZDJFX.dll` (iZotope FX), `DJFX.dll`, `libmp3lame.dll` / `lame_enc.dll`
  for set recording, `opengl32sw.dll` software-GL fallback.
- Hardware: `libusb-1.0.dll` + `libusbmuxd.dll` (direct USB), `pioneer_api.exe`,
  `asio_control_panel_launch.exe`. Confirms a pro DJ app needs **native audio
  (ASIO/CoreAudio) + raw USB** — a browser build can't match latency/exclusive mode,
  which is exactly why v1.0 keeps a Tauri path for the desktop client.
- `crashpad_handler.exe` — Google Crashpad crash reporting.

Takeaway for SoundGrid's eventual desktop client: keep the audio engine behind an
interface so the web build uses Web Audio + Web MIDI while a Tauri build can swap in
a native ASIO/CoreAudio backend and `libusb`-style device access without touching UI.

---

## 5. Minimal import plan for v0.16 (when we get there)

1. **Per-file first** — read `Serato Markers2` + `Serato BeatGrid` + `Serato Autotags`
   from the dropped/scanned files. No `_Serato_` needed, works for any user.
2. **Crates** — optional: let the user point at `_Serato_`, parse `Subcrates/*.crate`
   for path lists + `neworder.pref` for the tree, resolve metadata from `database V2`.
3. Map into SoundGrid types: `HotCue` ← `CUE`, saved loops ← `LOOP`, `bpm`/beatgrid ←
   `BeatGrid`, track colour ← `COLOR`. Store in IndexedDB keyed by file hash (v0.4).
4. **Read-only.** Never write back into Serato's files or DB.
