import { useEffect } from 'react'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'
import type { DeckId } from '../types'

/**
 * Single rAF loop that pushes each deck's authoritative playhead position into
 * the store so waveforms and time readouts track smoothly.
 */
export function useRenderLoop() {
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const { decks, patchDeck } = useStore.getState()
      ;(['A', 'B'] as DeckId[]).forEach((id) => {
        const d = engine.decks[id]
        if (!d.hasTrack) return
        const pos = d.position
        if (Math.abs(pos - decks[id].positionSec) > 0.001) {
          patchDeck(id, { positionSec: pos, playing: d.playing })
        } else if (d.playing !== decks[id].playing) {
          patchDeck(id, { playing: d.playing })
        }
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
}
