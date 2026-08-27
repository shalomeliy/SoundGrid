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
    <section className="flex min-h-0 flex-col rounded-lg border border-grid-border bg-grid-panel">
      <div className="flex items-center gap-2 border-b border-grid-border p-2">
        <button
          onClick={library.folderName ? pickNew : choose}
          className="rounded bg-accent px-2 py-1 text-xs font-semibold text-black"
          disabled={!library.supported}
        >
          {library.folderName ? 'Change folder' : 'Choose music folder'}
        </button>
        {!library.folderName && library.supported && (
          <button onClick={choose} className="rounded bg-grid-panel-2 px-2 py-1 text-xs">
            Reconnect last
          </button>
        )}
        <input
          value={library.query}
          onChange={(e) => setLibrary({ query: e.target.value })}
          placeholder="Search…"
          className="ml-auto w-48 rounded border border-grid-border bg-grid-bg px-2 py-1 text-xs outline-none"
        />
        <span className="text-xs text-grid-muted">{library.scanMsg}</span>
      </div>

      {!library.supported && (
        <p className="p-3 text-xs text-grid-muted">
          This browser can’t read local folders. Use Chrome or Edge on desktop for library
          access.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {list.map((t) => {
              const selected = t.id === library.selectedId
              return (
                <tr
                  key={t.id}
                  onClick={() => setLibrary({ selectedId: t.id })}
                  onDoubleClick={() => void ctl.loadTrackToDeck('A', t)}
                  className={`cursor-pointer border-b border-grid-border/40 ${
                    selected ? 'bg-accent/20' : 'hover:bg-grid-panel-2'
                  }`}
                >
                  <td className="px-3 py-1.5">{t.name}</td>
                  <td className="px-2 py-1.5 text-grid-muted">{t.kind}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void ctl.loadTrackToDeck('A', t)
                      }}
                      className="rounded bg-deck-a/20 px-1.5 py-0.5 text-deck-a"
                    >
                      A
                    </button>{' '}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void ctl.loadTrackToDeck('B', t)
                      }}
                      className="rounded bg-deck-b/20 px-1.5 py-0.5 text-deck-b"
                    >
                      B
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {list.length === 0 && library.folderName && !library.scanning && (
          <p className="p-3 text-xs text-grid-muted">No audio files found.</p>
        )}
      </div>
    </section>
  )
}
