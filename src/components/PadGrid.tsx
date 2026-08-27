import * as ctl from '../controls'
import { HOT_CUE_COLORS } from '../audio/constants'
import type { DeckId, HotCue } from '../types'

interface Props {
  deckId: DeckId
  hotCues: HotCue[]
}

/** 4x2 performance pad grid in Hot Cue mode. Click sets/jumps, shift-click deletes. */
export function PadGrid({ deckId, hotCues }: Props) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
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
            className="h-11 rounded border text-xs font-semibold transition-transform active:scale-95"
            style={{
              borderColor: color,
              background: cue ? color : 'transparent',
              color: cue ? '#000' : color,
            }}
          >
            {i + 1}
          </button>
        )
      })}
    </div>
  )
}
