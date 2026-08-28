import { useEffect, useMemo, useState } from 'react'
import * as ctl from '../controls'
import {
  ensureReadPermission,
  fileSystemAccessSupported,
  pickLibraryFolder,
  restoreLibraryFolder,
  scanLibrary,
} from '../library/library'
import { useShallow } from 'zustand/react/shallow'
import { mixRecommendations, type MixMatch } from '../recommend'
import { useStore } from '../state/store'
import type { Track } from '../types'
import { Button } from './controls'

const DECK_COLOR = { A: 'var(--color-deck-a)', B: 'var(--color-deck-b)' } as const

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

  // Narrow subscription to primitives only: the playhead moves every frame, but
  // recommendations depend just on play state / bpm / tempo / loaded track, so
  // the whole library list doesn't re-render 60×/s. useShallow compares each
  // element, so this must stay a flat array of primitives.
  const [aP, aB, aT, aId, bP, bB, bT, bId] = useStore(
    useShallow((s) => [
      s.decks.A.playing, s.decks.A.bpm, s.decks.A.tempo, s.decks.A.track?.id ?? null,
      s.decks.B.playing, s.decks.B.bpm, s.decks.B.tempo, s.decks.B.track?.id ?? null,
    ]),
  )
  const recs = useMemo(
    () =>
      mixRecommendations(
        [
          { id: 'A', playing: aP, bpm: aB, tempo: aT, trackId: aId },
          { id: 'B', playing: bP, bpm: bB, tempo: bT, trackId: bId },
        ],
        library.tracks,
      ),
    [aP, aB, aT, aId, bP, bB, bT, bId, library.tracks],
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
    setLibrary({ scanning: true, folderName: name, scanMsg: 'Scanning…' })
    const tracks = await scanLibrary(handle, (p) =>
      setLibrary({ scanMsg: `${p.found} tracks · ${p.currentDir}` }),
    )
    setLibrary({
      tracks,
      scanning: false,
      scanMsg: `${tracks.length} tracks`,
      selectedId: tracks[0]?.id ?? null,
    })
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
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-surface-1">
              <tr className="border-b border-hairline">
                <Th className="pl-3 text-left">Title</Th>
                <Th className="text-left">Type</Th>
                <Th className="text-right tnum">BPM</Th>
                <Th className="text-right tnum">Time</Th>
                <Th className="pr-3 text-right">Load</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <Row
                  key={t.id}
                  track={t}
                  selected={t.id === library.selectedId}
                  match={recs.get(t.id)}
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
  onSelect,
}: {
  track: Track
  selected: boolean
  match?: MixMatch
  onSelect: () => void
}) {
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
      className={`h-11 cursor-grab border-b border-hairline/50 transition-colors active:cursor-grabbing ${
        selected ? 'bg-accent/15' : 'hover:bg-surface-2'
      }`}
    >
      <td
        className={`relative max-w-0 truncate py-1.5 pl-3 pr-2 ${
          match?.strong ? 'font-bold text-grid-text' : 'font-medium'
        }`}
      >
        {selected && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />}
        {match && (
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle"
            style={{ background: DECK_COLOR[match.deck], opacity: match.strong ? 1 : 0.5 }}
            title={`Mixes with deck ${match.deck}${match.strong ? '' : ' (loose)'}`}
          />
        )}
        {track.name}
      </td>
      <td className="py-1.5 pr-2 uppercase text-grid-dim">{track.kind}</td>
      <td className="tnum py-1.5 pr-2 text-right text-grid-muted">
        {track.bpm ? track.bpm.toFixed(0) : '–'}
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
