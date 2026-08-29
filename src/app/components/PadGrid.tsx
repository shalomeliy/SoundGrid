import * as ctl from '@/controls'
import { HOT_CUE_COLORS } from '@/core/constants'
import type { DeckId, HotCue } from '@/core/types'

interface Props {
  deckId: DeckId
  hotCues: HotCue[]
}

/** 4x2 performance pad grid in Hot Cue mode. Click sets/jumps, shift-click deletes. */
export function PadGrid({ deckId, hotCues }: Props) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label">Hot Cues</span>
        <span className="text-2xs text-grid-dim">shift-click to clear</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {Array.from({ length: 8 }, (_, i) => {
          const cue = hotCues.find((c) => c.index === i)
          const color = cue?.color ?? HOT_CUE_COLORS[i]
          return (
            <button
              key={i}
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
            </button>
          )
        })}
      </div>
    </div>
  )
}
