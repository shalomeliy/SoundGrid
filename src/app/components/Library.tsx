import { useEffect, useMemo, useRef, useState } from 'react'
import * as ctl from '@/controls'
import {
  ensureReadPermission,
  fileSystemAccessSupported,
  pickLibraryFolder,
  readLibraryTags,
  restoreLibraryFolder,
  scanLibrary,
} from '@/platform/source-fsaccess/library'
import { useShallow } from 'zustand/react/shallow'
import { mixRecommendations, type MixMatch } from '@/core/recommend'
import { useStore } from '@/app/state/store'
import type { Track } from '@/core/types'
import { Button } from '@/app/components/controls'

const DECK_COLOR = { A: 'var(--color-deck-a)', B: 'var(--color-deck-b)' } as const

type KeyMode = 'musical' | 'camelot'
const KEY_MODE_STORAGE = 'soundgrid:keyMode'

function loadKeyMode(): KeyMode {
  try {
    return localStorage.getItem(KEY_MODE_STORAGE) === 'camelot' ? 'camelot' : 'musical'
  } catch {
    return 'musical'
  }
}

/** Camelot when asked for and known, musical otherwise — never an empty cell. */
function keyLabel(track: Track, mode: KeyMode): string | undefined {
  return mode === 'camelot' ? (track.camelot ?? track.key) : track.key
}

/**
 * Colour the key by its position on the Camelot wheel.
 *
 * Serato colours keys too, but its palette is arbitrary — the colour is just a
 * second name for the label. Deriving hue from the wheel makes it carry the
 * thing you actually care about: neighbouring numbers mix, so compatible keys
 * land on neighbouring hues and a clash is visibly far away. OKLCH keeps every
 * hue at the same perceived lightness, so no key is harder to read than another
 * (plain HSL would make the blues muddy and the yellows glare).
 */
function keyColor(camelot: string | undefined): string | null {
  const m = camelot ? /^(\d{1,2})([AB])$/.exec(camelot) : null
  if (!m) return null
  const hue = (Number(m[1]) - 1) * 30
  // minor keys sit deeper and more saturated than their relative majors
  return m[2] === 'A' ? `oklch(0.78 0.15 ${hue})` : `oklch(0.85 0.11 ${hue})`
}

function fmtTime(sec?: number) {
  if (!sec || !isFinite(sec)) return '–'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Library() {
  const library = useStore((s) => s.library)
  const setLibrary = useStore((s) => s.setLibrary)
  const [mixOnly, setMixOnly] = useState(false)
  // Which key notation to show. DJs are split between musical and Camelot and
  // nobody wants to relearn theirs, so it's a preference that sticks.
  const [keyMode, setKeyMode] = useState<KeyMode>(loadKeyMode)
  const skippedTotal = Object.values(library.skipped).reduce((a, b) => a + b, 0)
  // lets a new scan abandon the tag pass of the one it replaced
  const tagScan = useRef({ cancelled: false })

  // Narrow subscription to primitives only: the playhead moves every frame, but
  // recommendations depend just on play state / bpm / tempo / loaded track, so
  // the whole library list doesn't re-render 60×/s. useShallow compares each
  // element, so this must stay a flat array of primitives.
  const [aP, aB, aT, aId, aK, bP, bB, bT, bId, bK] = useStore(
    useShallow((s) => [
      s.decks.A.playing, s.decks.A.bpm, s.decks.A.tempo, s.decks.A.track?.id ?? null,
      s.decks.A.track?.camelot ?? null,
      s.decks.B.playing, s.decks.B.bpm, s.decks.B.tempo, s.decks.B.track?.id ?? null,
      s.decks.B.track?.camelot ?? null,
    ]),
  )
  const recs = useMemo(
    () =>
      mixRecommendations(
        [
          { id: 'A', playing: aP, bpm: aB, tempo: aT, trackId: aId, camelot: aK },
          { id: 'B', playing: bP, bpm: bB, tempo: bT, trackId: bId, camelot: bK },
        ],
        library.tracks,
      ),
    [aP, aB, aT, aId, aK, bP, bB, bT, bId, bK, library.tracks],
  )

  useEffect(() => {
    setLibrary({ supported: fileSystemAccessSupported() })
    void restoreLibraryFolder().then((f) => {
      if (f) setLibrary({ folderName: f.name })
    })
  }, [setLibrary])

  async function choose() {
    const folder = (await restoreLibraryFolder()) ?? (await pickLibraryFolder())
    if (!folder) return
    if (!(await ensureReadPermission(folder.handle))) {
      const fresh = await pickLibraryFolder()
      if (!fresh) return
      await runScan(fresh.handle, fresh.name)
      return
    }
    await runScan(folder.handle, folder.name)
  }

  async function pickNew() {
    const folder = await pickLibraryFolder()
    if (!folder) return
    await runScan(folder.handle, folder.name)
  }

  async function runScan(handle: FileSystemDirectoryHandle, name: string) {
    tagScan.current.cancelled = true // a previous tag pass must not write into this list
    const scan = { cancelled: false }
    tagScan.current = scan

    setLibrary({ scanning: true, folderName: name, scanMsg: 'Scanning…' })
    const { tracks, skipped } = await scanLibrary(handle, (p) =>
      setLibrary({ scanMsg: `${p.found} tracks · ${p.currentDir}` }),
    )
    setLibrary({
      tracks,
      skipped,
      scanning: false,
      scanMsg: `${tracks.length} tracks · reading tags…`,
      selectedId: tracks[0]?.id ?? null,
    })

    // second pass: BPM/key/artist straight out of the file headers (v0.1.7)
    await readLibraryTags(
      tracks,
      (patch, progress) => {
        if (scan.cancelled) return
        const store = useStore.getState()
        if (patch.size > 0) {
          store.setLibrary({
            tracks: store.library.tracks.map((t) => {
              const p = patch.get(t.id)
              // never clobber values analysis already produced
              return p ? { ...p, ...t, bpm: t.bpm ?? p.bpm } : t
            }),
          })
        }
        store.setLibrary({
          scanMsg:
            progress.done < progress.total
              ? `${progress.total} tracks · tags ${progress.done}/${progress.total}`
              : `${progress.total} tracks · ${progress.tagged} with BPM`,
        })
      },
      { signal: scan },
    )
  }

  const list = mixOnly
    ? ctl.filteredTracks().filter((t) => recs.has(t.id))
    : ctl.filteredTracks()

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-hairline p-2">
        <Button
          variant="toggle"
          active={!library.folderName}
          tone="var(--color-accent)"
          onClick={library.folderName ? pickNew : choose}
          disabled={!library.supported}
        >
          {library.folderName ? 'Change folder' : 'Choose music folder'}
        </Button>
        {library.folderName && (
          <span className="max-w-[12rem] truncate text-xs text-grid-muted">{library.folderName}</span>
        )}
        {!library.folderName && library.supported && (
          <Button variant="ghost" size="sm" onClick={choose}>
            Reconnect last
          </Button>
        )}

        {recs.size > 0 && (
          <Button
            variant="toggle"
            size="sm"
            active={mixOnly}
            tone="var(--color-live)"
            className="ml-auto"
            onClick={() => setMixOnly((v) => !v)}
            title="Show only tracks that mix with what's playing"
          >
            ♫ {recs.size} mixable
          </Button>
        )}

        <label className={`relative ${recs.size > 0 ? '' : 'ml-auto'}`}>
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-grid-dim">⌕</span>
          <input
            value={library.query}
            onChange={(e) => setLibrary({ query: e.target.value })}
            placeholder="Filter tracks…"
            className="w-52 rounded-[var(--radius-sm)] border border-hairline bg-surface-0 py-1 pl-6 pr-2 text-xs outline-none transition-colors focus-visible:border-transparent focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          />
        </label>
        <span className="tnum flex items-center gap-1.5 text-xs text-grid-muted">
          {library.scanning && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          )}
          {library.scanMsg || (library.tracks.length ? `${library.tracks.length} tracks` : '')}
          {!library.scanning && skippedTotal > 0 && (
            <span
              className="rounded-[var(--radius-xs)] bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-warn"
              title={`Files in this folder the browser cannot play, so they are not listed: ${Object.entries(
                library.skipped,
              )
                .map(([ext, n]) => `${n} × .${ext}`)
                .join(', ')}`}
            >
              {skippedTotal} skipped
            </span>
          )}
        </span>
      </div>

      {!library.supported ? (
        <EmptyState
          title="Local library needs Chrome or Edge"
          body="SoundGrid reads audio straight from a folder on your disk using the File System Access API. Open it in a Chromium desktop browser to scan your collection."
        />
      ) : library.scanning && list.length === 0 ? (
        <EmptyState title="Scanning your folder…" body={library.scanMsg} pulse />
      ) : !library.folderName ? (
        <EmptyState
          title="No music folder yet"
          body="Choose a folder and SoundGrid indexes every audio file inside it. Nothing is uploaded — files stay on your machine."
        />
      ) : list.length === 0 ? (
        <EmptyState
          title={library.query ? 'No tracks match that filter' : 'No audio files found'}
          body={
            library.query
              ? 'Clear the filter to see the whole library.'
              : 'This folder has no readable .mp3, .wav, .flac, .ogg or .m4a files.'
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {/*
            Sized against Serato on the same 14" panel: it fits ~31px rows with
            ~16px type, i.e. denser *and* far more legible than a tall row full
            of small text. Rows are 36px with 14px type — you see more tracks
            than before and read them at a glance.
          */}
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface-1">
              <tr className="border-b border-hairline">
                {/* explicit widths: the title/artist cells use max-w-0 to truncate,
                    which collapses them to nothing without a column width to size against */}
                <Th className="w-[46%] pl-3 text-left">Title</Th>
                <Th className="w-[18%] text-left">Artist</Th>
                <Th className="w-14 text-left">Type</Th>
                <Th className="w-16 text-right tnum">BPM</Th>
                <Th className="w-20 text-right">
                  <button
                    onClick={() => {
                      const next = keyMode === 'musical' ? 'camelot' : 'musical'
                      setKeyMode(next)
                      try {
                        localStorage.setItem(KEY_MODE_STORAGE, next)
                      } catch {
                        // private mode — the preference just won't outlive the session
                      }
                    }}
                    title={
                      keyMode === 'musical'
                        ? 'Showing musical keys — click for Camelot'
                        : 'Showing Camelot codes — click for musical keys'
                    }
                    className="label -mr-1 rounded-[var(--radius-xs)] px-1 py-0.5 transition-colors hover:bg-surface-2 hover:text-grid-text"
                  >
                    {keyMode === 'musical' ? 'Key' : 'Camelot'}
                  </button>
                </Th>
                <Th className="w-16 text-right tnum">Time</Th>
                <Th className="w-24 pr-3 text-right">Load</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <Row
                  key={t.id}
                  track={t}
                  selected={t.id === library.selectedId}
                  match={recs.get(t.id)}
                  keyMode={keyMode}
                  onSelect={() => setLibrary({ selectedId: t.id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`label py-1.5 font-semibold ${className}`}>{children}</th>
}

function Row({
  track,
  selected,
  match,
  keyMode,
  onSelect,
}: {
  track: Track
  selected: boolean
  match?: MixMatch
  keyMode: KeyMode
  onSelect: () => void
}) {
  const key = keyLabel(track, keyMode)
  const tone = keyColor(track.camelot)
  return (
    <tr
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-soundgrid-track', track.id)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={onSelect}
      onDoubleClick={() => void ctl.loadTrackToDeck('A', track)}
      aria-selected={selected}
      className={`h-9 cursor-grab border-b border-hairline/50 transition-colors active:cursor-grabbing ${
        selected ? 'bg-accent/15' : 'hover:bg-surface-2'
      }`}
    >
      <td
        className={`relative max-w-0 py-1.5 pl-3 pr-2 leading-tight ${
          match?.strong ? 'font-bold text-grid-text' : 'font-medium'
        }`}
      >
        {selected && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />}
        <span className="flex items-center gap-1.5">
          {match && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: DECK_COLOR[match.deck], opacity: match.strong ? 1 : 0.5 }}
              title={
                `Mixes with deck ${match.deck}${match.strong ? '' : ' (loose)'}` +
                (match.keyMatch === undefined
                  ? ''
                  : match.keyMatch
                    ? ' · key compatible'
                    : ' · key clashes')
              }
            />
          )}
          <span className="truncate">{track.title ?? track.name}</span>
        </span>
      </td>
      <td className="max-w-0 truncate py-1.5 pr-2 text-grid-muted">{track.artist}</td>
      <td className="py-1.5 pr-2 text-2xs uppercase text-grid-dim">{track.kind}</td>
      {/* BPM is a primary mixing datum, not metadata — it reads at full brightness */}
      <td className="tnum py-1.5 pr-2 text-right font-medium text-grid-text">
        {track.bpm ? track.bpm.toFixed(0) : <span className="font-normal text-grid-dim">–</span>}
      </td>
      <td className="py-1.5 pr-2 text-right">
        {key ? (
          <span
            className="tnum rounded-[var(--radius-xs)] px-1.5 py-0.5 font-semibold"
            style={
              tone
                ? { color: tone, background: `color-mix(in oklab, ${tone}, transparent 88%)` }
                : { color: 'var(--color-grid-muted)', background: 'var(--color-surface-2)' }
            }
            title={track.camelot && track.key ? `${track.key} · Camelot ${track.camelot}` : key}
          >
            {key}
          </span>
        ) : (
          <span className="text-grid-dim">–</span>
        )}
      </td>
      <td className="tnum py-1.5 pr-2 text-right text-grid-muted">{fmtTime(track.durationSec)}</td>
      <td className="whitespace-nowrap py-1.5 pl-2 pr-3 text-right">
        <LoadBtn deck="A" track={track} />
        <LoadBtn deck="B" track={track} />
      </td>
    </tr>
  )
}

function LoadBtn({ deck, track }: { deck: 'A' | 'B'; track: Track }) {
  const tone = deck === 'A' ? 'var(--color-deck-a)' : 'var(--color-deck-b)'
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        void ctl.loadTrackToDeck(deck, track)
      }}
      aria-label={`Load to deck ${deck}`}
      className="ml-1 inline-grid h-6 w-6 place-items-center rounded-[var(--radius-xs)] text-2xs font-bold transition-colors"
      style={{ background: `color-mix(in srgb, ${tone}, transparent 82%)`, color: tone }}
    >
      {deck}
    </button>
  )
}

function EmptyState({
  title,
  body,
  pulse = false,
}: {
  title: string
  body?: string
  pulse?: boolean
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <span
        className={`grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-grid-muted ${
          pulse ? 'animate-pulse' : ''
        }`}
      >
        ♫
      </span>
      <p className="text-sm font-medium text-grid-text">{title}</p>
      {body && <p className="max-w-sm text-xs leading-relaxed text-grid-muted">{body}</p>}
    </div>
  )
}
