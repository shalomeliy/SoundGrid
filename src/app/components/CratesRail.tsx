import * as ctl from '@/controls'
import { matchesQuery } from '@/core/library-search'
import { useStore } from '@/app/state/store'
import { Button } from '@/app/components/controls'
import type { CrateRecord } from '@/platform/crates-idb/store'

/**
 * The crate rail (v0.8.1) — a flat list of named track groupings, collapsed
 * into the Library panel beside the table rather than a second header row
 * (the ~710px height budget is already nearly spent by the table's own
 * chrome; the rail spends width instead). No tree: a flat list is what the
 * feature spec settled on after the owner's real library — a few hundred
 * tracks in six genre folders — turned out not to need nesting.
 *
 * Drag-and-drop onto a crate row is added in the next step; this version
 * covers list/create/rename/delete/refresh only, so each piece is verified
 * on its own rather than landing as one large, harder-to-check diff.
 */
export function CratesRail() {
  const crates = useStore((s) => s.crates)
  const tracks = useStore((s) => s.library.tracks)
  const query = useStore((s) => s.library.query)
  const knownHashes = new Set(tracks.map((t) => t.contentHash).filter((h): h is string => h != null))

  function onNewCrate() {
    const name = window.prompt('New crate name:')
    if (name?.trim()) ctl.createCrate(name.trim())
  }

  function onSaveSearchAsCrate() {
    const name = window.prompt('Save the current search as a crate named:')
    if (name?.trim()) ctl.createSmartCrate(name.trim(), query)
  }

  function onDelete(crate: CrateRecord) {
    const count = (crate.kind === 'manual' ? crate.members : crate.materialized)?.length ?? 0
    const warning =
      count > 0
        ? `Delete "${crate.name}"? It has ${count} track${count === 1 ? '' : 's'} in it — the tracks themselves are not deleted, only this grouping.`
        : `Delete "${crate.name}"?`
    if (window.confirm(warning)) ctl.deleteCrate(crate.id)
  }

  return (
    <div className="flex w-40 shrink-0 flex-col gap-1 overflow-y-auto border-r border-hairline p-2">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-wide text-grid-dim">Crates</span>
      </div>
      <Button variant="ghost" size="sm" onClick={onNewCrate}>
        + New crate
      </Button>
      {query.trim() && (
        <Button variant="ghost" size="sm" onClick={onSaveSearchAsCrate} title={`Save "${query}" as a smart crate`}>
          ★ Save search
        </Button>
      )}
      <div className="mt-1 flex flex-col gap-0.5">
        {[...crates.values()].map((crate) => (
          <CrateRow key={crate.id} crate={crate} knownHashes={knownHashes} onDelete={() => onDelete(crate)} />
        ))}
      </div>
    </div>
  )
}

function CrateRow({
  crate,
  knownHashes,
  onDelete,
}: {
  crate: CrateRecord
  knownHashes: Set<string>
  onDelete: () => void
}) {
  const members = crate.kind === 'manual' ? (crate.members ?? []) : (crate.materialized ?? [])
  const missing = members.filter((h) => !knownHashes.has(h)).length
  // Stale = re-running the saved query against the library right now would
  // produce a different result than the last refresh froze into
  // `materialized`. This recomputes the match for comparison only — it is
  // never written back, so "updates only on a refresh click" still holds
  // for the stored data; only the badge is live.
  const tracks = useStore((s) => s.library.tracks)
  const stale =
    crate.kind === 'smart' &&
    crate.query != null &&
    (() => {
      const current = tracks.filter((t) => t.contentHash && matchesQuery(t, crate.query!)).map((t) => t.contentHash)
      const before = crate.materialized ?? []
      return current.length !== before.length || current.some((h) => !before.includes(h!))
    })()

  return (
    <div className="group rounded-[var(--radius-sm)] px-2 py-1 text-xs hover:bg-surface-2">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate" title={crate.name}>
          {crate.kind === 'smart' ? '★ ' : ''}
          {crate.name}
        </span>
        <span className="tnum shrink-0 text-2xs text-grid-dim">{members.length}</span>
        <button
          onClick={onDelete}
          className="shrink-0 text-2xs text-grid-dim opacity-0 hover:text-warn group-hover:opacity-100"
          title="Delete this crate"
        >
          ✕
        </button>
      </div>
      {crate.kind === 'smart' && (
        <div className="mt-0.5 flex items-center gap-1">
          <button
            onClick={() => ctl.refreshSmartCrate(crate.id)}
            className="text-2xs text-grid-dim hover:text-grid-text"
            title={`Re-run the saved search: ${crate.query}`}
          >
            ⟳ refresh
          </button>
          {stale && (
            <span
              className="rounded-[var(--radius-xs)] bg-surface-2 px-1 py-0.5 text-2xs font-semibold text-warn"
              title="The library changed since this crate was last refreshed — click refresh to update it."
            >
              stale
            </span>
          )}
        </div>
      )}
      {missing > 0 && (
        <div
          className="mt-0.5 text-2xs text-warn"
          title="These tracks are no longer in the library — moved or deleted outside SoundGrid."
        >
          {missing} not found
        </div>
      )}
    </div>
  )
}
