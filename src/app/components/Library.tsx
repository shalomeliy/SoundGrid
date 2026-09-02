import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as ctl from '@/controls'
import {
  ensureReadPermission,
  fileSystemAccessSupported,
  pickLibraryFolder,
  pickTrackFiles,
  readLibraryTags,
  restoreLibraryFolder,
  scanLibrary,
} from '@/platform/source-fsaccess/library'
import { useShallow } from 'zustand/react/shallow'
import { bootCopy, bootFor, bootForScanError } from '@/core/library-boot'
import { mixRecommendations, type MixMatch } from '@/core/recommend'
import { settings } from '@/platform/settings-idb/store'
import { useSettings } from '@/app/hooks/useSettings'
import { useStore } from '@/app/state/store'
import type { KeyMode } from '@/core/settings'
import type { Track } from '@/core/types'
import { Button } from '@/app/components/controls'

const DECK_COLOR = { A: 'var(--color-deck-a)', B: 'var(--color-deck-b)' } as const

/**
 * The key spelling was this component's own `localStorage` entry until v0.2.5 —
 * one of the three settings the app saved with no schema, no version and no
 * owner. It lives in the settings port now; the header button and the Settings
 * screen are two views of the same value, and the old key is migrated once on
 * first load (`core/settings.ts`, `migrate`).
 */

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
  const { keyMode, libraryTextScale } = useSettings()
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

  /**
   * Every path below can throw something the browser invented, and an async
   * handler that throws produces an unhandled rejection — which is to say
   * nothing on screen at all. That is the silent skip this version exists to
   * remove, so it must not be how this version fails: `queryPermission` on a
   * folder that is gone, an IndexedDB that will not open (private window,
   * blocked storage, a corrupt profile), and `requestPermission` losing its
   * activation all land here and become copy.
   */
  function reportFailure(err: unknown) {
    const e = err as DOMException
    setLibrary({
      boot: bootForScanError(e?.name ?? ''),
      bootDetail: e?.message || e?.name || String(err),
      scanning: false,
      scanMsg: '',
    })
  }

  /**
   * Startup (v0.2.6). The only branch that scans unattended is the one where
   * the saved handle still reads `granted` — everything else waits for a
   * gesture and says on screen what it is waiting for. Nothing here calls
   * `requestPermission`: outside a click it raises no dialog, so it would fail
   * with nothing visible, which is the exact failure this version removes.
   */
  useEffect(() => {
    const supported = fileSystemAccessSupported()
    setLibrary({ supported })
    if (!supported) {
      setLibrary({ boot: 'unsupported' })
      return
    }
    void (async () => {
      try {
        const saved = await restoreLibraryFolder()
        const boot = bootFor(true, saved)
        setLibrary({ boot, folderName: saved?.name ?? null })
        if (boot === 'restoring' && saved) await runScan(saved.handle, saved.name)
      } catch (err) {
        // without this the panel sits on "Looking for your library…" forever
        reportFailure(err)
      }
    })()
    // runScan is stable for the component's lifetime; re-running this effect
    // would re-scan the folder on every render that touches the library.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setLibrary])

  /**
   * The single click that mode 2 asks for. This is the one place allowed to
   * call `requestPermission`, because it is reached from a real click.
   */
  async function reconnect() {
    try {
      const saved = await restoreLibraryFolder()
      if (!saved) return pickNew()
      if (!(await ensureReadPermission(saved.handle))) {
        setLibrary({ boot: 'blocked', folderName: saved.name })
        return
      }
      await runScan(saved.handle, saved.name)
    } catch (err) {
      // a click that does nothing and says nothing is the worst of the three
      reportFailure(err)
    }
  }

  async function pickNew() {
    try {
      const folder = await pickLibraryFolder()
      if (!folder) return
      await runScan(folder.handle, folder.name)
    } catch (err) {
      reportFailure(err)
    }
  }

  async function runScan(handle: FileSystemDirectoryHandle, name: string) {
    tagScan.current.cancelled = true // a previous tag pass must not write into this list
    const scan = { cancelled: false }
    tagScan.current = scan

    setLibrary({ scanning: true, folderName: name, scanMsg: 'Scanning…', bootDetail: null })

    let tracks: Track[]
    let skipped: Record<string, number>
    try {
      ;({ tracks, skipped } = await scanLibrary(handle, (p) =>
        setLibrary({ scanMsg: `${p.found} tracks · ${p.currentDir}` }),
      ))
    } catch (err) {
      // A folder that was renamed throws here, and an empty list looks exactly
      // like a folder with no music in it — so the failure gets a name and a
      // sentence rather than a blank panel.
      const e = err as DOMException
      setLibrary({
        boot: bootForScanError(e?.name ?? ''),
        bootDetail: e?.message || e?.name || String(err),
        scanning: false,
        scanMsg: '',
        tracks: [],
        skipped: {},
      })
      return
    }

    setLibrary({
      tracks,
      skipped,
      boot: 'loaded',
      scanning: false,
      scanMsg: `${tracks.length} tracks · reading tags…`,
      selectedId: tracks[0]?.id ?? null,
    })

    await applyTags(tracks, scan)
  }

  /**
   * Add individual tracks without touching the ones already loaded. Folder scan
   * replaces the library; this merges, so grabbing one song never costs you the
   * folder you just imported.
   */
  async function addFiles() {
    const picked = await pickTrackFiles()
    if (!picked.length) return

    const scan = { cancelled: false }
    tagScan.current = scan

    const current = useStore.getState().library.tracks
    const known = new Set(current.map((t) => t.id))
    const fresh = picked.filter((t) => !known.has(t.id))
    if (!fresh.length) {
      setLibrary({ scanMsg: `${picked.length} already in the library` })
      return
    }
    setLibrary({
      tracks: [...current, ...fresh].sort((a, b) => a.path.localeCompare(b.path)),
      selectedId: fresh[0].id,
      folderName: useStore.getState().library.folderName ?? 'Added files',
      // tracks are on screen now, so the startup sentence must give way
      boot: 'loaded',
      scanMsg: `+${fresh.length} · reading tags…`,
    })
    await applyTags(fresh, scan)
  }

  /** Second pass: BPM/key/artist straight out of the file headers (v0.1.7). */
  async function applyTags(tracks: Track[], scan: { cancelled: boolean }) {
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
        const total = store.library.tracks.length
        store.setLibrary({
          scanMsg:
            progress.done < progress.total
              ? `${total} tracks · tags ${progress.done}/${progress.total}`
              : `${total} tracks · ${progress.tagged} with BPM`,
        })
      },
      { signal: scan },
    )
  }

  const list = mixOnly
    ? ctl.filteredTracks().filter((t) => recs.has(t.id))
    : ctl.filteredTracks()

  // null once tracks are on screen — that is the only state with no sentence
  const boot = bootCopy(library.boot, library.folderName, library.bootDetail ?? undefined)

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-hairline p-2">
        {/*
          The header keeps the *other* choice, never a second copy of the one
          the panel is already asking for: while a startup state is on screen
          its own button is the call to action, and offering the same action
          twice next to a third, louder button read as three ways out of one
          situation.
        */}
        <Button
          variant="toggle"
          active={library.boot === 'new'}
          tone="var(--color-accent)"
          onClick={pickNew}
          disabled={!library.supported}
        >
          {library.boot === 'new' ? 'Load my music folder' : 'Change folder'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={addFiles}
          disabled={!library.supported}
          title="Pick one or more individual tracks and add them to the list"
        >
          + Files
        </Button>
        {library.folderName && (
          <span className="max-w-[12rem] truncate text-xs text-grid-muted">{library.folderName}</span>
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

      {library.scanning && list.length === 0 ? (
        <EmptyState title="Scanning your folder…" body={library.scanMsg} pulse />
      ) : boot ? (
        /*
          One sentence per startup situation (v0.2.6). The panel is never
          allowed to be empty and silent: `bootCopy` returns copy for every
          state except `loaded`, and a test in tests/core/ holds that.
        */
        <EmptyState
          title={boot.title}
          body={boot.body}
          pulse={library.boot === 'checking' || library.boot === 'restoring'}
          action={
            boot.cta ? (
              <Button
                variant="toggle"
                active
                tone="var(--color-accent)"
                onClick={library.boot === 'needs-click' ? reconnect : pickNew}
              >
                {boot.cta}
              </Button>
            ) : undefined
          }
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
          {/* The scale rides on the table's own font-size and everything inside
              is in `em`-equivalent Tailwind steps, so rows, headers and the key
              cell grow together. On the owner's 157-PPI panel every CSS pixel
              renders at ~0.76 of its nominal size, which is why this is a
              legibility control and not a cosmetic one. */}
          <table
            className="w-full border-collapse text-sm"
            style={libraryTextScale === 1 ? undefined : { fontSize: `${libraryTextScale * 0.875}rem` }}
          >
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
                      void settings.set('keyMode', keyMode === 'musical' ? 'camelot' : 'musical')
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
  action,
}: {
  title: string
  body?: string
  pulse?: boolean
  /** the one button that resolves this state, when one can */
  action?: ReactNode
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
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
