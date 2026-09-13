import { useEffect, useState } from 'react'
import * as ctl from '@/controls'
import { useStore } from '@/app/state/store'
import { Button } from '@/app/components/controls'

const DECK_COLOR = { A: 'var(--color-deck-a)', B: 'var(--color-deck-b)' } as const

/**
 * v0.8.3's full-screen setlist recap — same overlay shell as `SettingsScreen`
 * (`Settings.tsx`), no router, no modal library. Reached only once
 * `history.length > 0` (see `TopBar`'s conditional entry button), so there
 * is no reachable empty state to design for here.
 */
export function SetHistoryScreen({ onClose }: { onClose: () => void }) {
  const history = useStore((s) => s.history)
  const [saving, setSaving] = useState(false)

  // Esc closes — same reasoning as SettingsScreen: a full-screen panel with
  // no keyboard way out is a trap, and the decks keep playing behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      aria-label={`Set history, ${history.length} entries`}
      className="absolute inset-0 z-40 flex flex-col bg-surface-0/97 backdrop-blur-sm"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-2.5">
        <h2 className="text-sm font-bold tracking-tight">Set history</h2>
        <span className="text-2xs text-grid-dim">{history.length} loaded this session</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-2xs text-grid-dim">Esc to close</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving || history.length === 0}
            onClick={async () => {
              setSaving(true)
              try {
                await ctl.exportSetHistory()
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Saving…' : 'Export'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </header>
      <ul aria-label={`Set history, ${history.length} entries`} className="flex-1 overflow-y-auto p-4">
        {history.map((e, i) => (
          <li key={i} className="flex items-center gap-2 border-b border-hairline py-1.5 text-xs">
            <span className="tnum w-6 text-right text-grid-dim">{i + 1}.</span>
            <span
              aria-label={`Loaded on deck ${e.deckId}`}
              className="grid h-4 w-4 shrink-0 place-items-center rounded-[var(--radius-xs)] text-[10px] font-bold leading-none"
              style={{
                background: `color-mix(in srgb, ${DECK_COLOR[e.deckId]}, transparent 82%)`,
                color: DECK_COLOR[e.deckId],
              }}
            >
              {e.deckId}
            </span>
            <span className="flex-1 truncate">{e.artist ? `${e.artist} — ${e.name}` : e.name}</span>
            <span className="tnum text-grid-dim">
              {new Date(e.loadedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
