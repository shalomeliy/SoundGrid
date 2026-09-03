import * as ctl from '@/controls'
import { HOT_CUE_COLORS } from '@/core/constants'
import type { DeckId, HotCue } from '@/core/types'

interface Props {
  deckId: DeckId
  hotCues: HotCue[]
}

/** Drag payload: the source pad's index, as plain text. */
const HOT_CUE_MIME = 'application/x-soundgrid-hotcue'

/**
 * 4x2 performance pad grid in Hot Cue mode (v0.4.0).
 *
 * Click sets/jumps. Delete is two ways to the same action, on purpose — a
 * hover-revealed `×` (discoverable) and `Shift`+click (existing muscle
 * memory, kept). Dragging an occupied pad onto an empty one relocates the
 * cue; onto another occupied pad, it swaps them — never a silent overwrite.
 * The `×` is a `span[role=button]`, not a nested `<button>`, because the
 * whole pad is already one.
 */
export function PadGrid({ deckId, hotCues }: Props) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label">Hot Cues</span>
        <span className="text-2xs text-grid-dim">× or shift-click to clear</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {Array.from({ length: 8 }, (_, i) => {
          const cue = hotCues.find((c) => c.index === i)
          const color = cue?.color ?? HOT_CUE_COLORS[i]
          return (
            <button
              key={i}
              draggable={!!cue}
              onDragStart={(e) => {
                e.dataTransfer.setData(HOT_CUE_MIME, String(i))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(HOT_CUE_MIME)) e.preventDefault()
              }}
              onDrop={(e) => {
                if (!e.dataTransfer.types.includes(HOT_CUE_MIME)) return
                e.preventDefault()
                const from = Number(e.dataTransfer.getData(HOT_CUE_MIME))
                ctl.moveHotCue(deckId, from, i)
              }}
              onClick={(e) => {
                if (e.shiftKey && cue) ctl.deleteHotCue(deckId, i)
                else ctl.setHotCue(deckId, i)
              }}
              aria-label={cue ? `Jump to hot cue ${i + 1}` : `Set hot cue ${i + 1}`}
              className="group relative h-10 rounded-[var(--radius-sm)] text-2xs font-bold tabular-nums transition-[transform,box-shadow,background] duration-100 ease-[var(--ease-out)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
              style={
                cue
                  ? {
                      background: color,
                      color: '#000',
                      boxShadow: `0 0 0 1px ${color}, 0 0 14px -3px ${color}`,
                    }
                  : {
                      background: 'var(--color-surface-2)',
                      color: 'var(--color-grid-dim)',
                      boxShadow: `inset 0 0 0 1px ${color}33`,
                    }
              }
            >
              <span
                className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full"
                style={{ background: cue ? '#0007' : color, opacity: cue ? 1 : 0.5 }}
              />
              {i + 1}
              {cue && (
                // A hover-revealed `span[role=button]`, not a nested
                // `<button>` (the pad is already one, and HTML forbids
                // interactive descendants of a button). Mouse-only by design
                // — `Shift`+click above reaches this same delete without a
                // pointer resting on the pad, so this adds no keyboard gap
                // beyond what the pad's own drag gesture already has.
                <span
                  role="button"
                  aria-label={`Delete hot cue ${i + 1}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    ctl.deleteHotCue(deckId, i)
                  }}
                  className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full text-[10px] leading-none text-black opacity-0 transition-opacity duration-100 hover:bg-black/20 group-hover:opacity-100"
                >
                  ×
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
