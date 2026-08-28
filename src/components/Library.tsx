import { useEffect } from 'react'
import * as ctl from '../controls'
import {
  ensureReadPermission,
  fileSystemAccessSupported,
  pickLibraryFolder,
  restoreLibraryFolder,
  scanLibrary,
} from '../library/library'
import { useStore } from '../state/store'
import type { Track } from '../types'
import { Button } from './controls'

function fmtTime(sec?: number) {
  if (!sec || !isFinite(sec)) return '–'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function Library() {
  const library = useStore((s) => s.library)
  const setLibrary = useStore((s) => s.setLibrary)

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

  const list = ctl.filteredTracks()

  return (
    <section className="panel flex min-h-0 flex-col">
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

        <label className="relative ml-auto">
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
  onSelect,
}: {
  track: Track
  selected: boolean
  onSelect: () => void
}) {
  return (
    <tr
      onClick={onSelect}
      onDoubleClick={() => void ctl.loadTrackToDeck('A', track)}
      aria-selected={selected}
      className={`h-11 cursor-pointer border-b border-hairline/50 transition-colors ${
        selected ? 'bg-accent/15' : 'hover:bg-surface-2'
      }`}
    >
      <td className="relative max-w-0 truncate py-1.5 pl-3 pr-2 font-medium">
        {selected && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />}
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
