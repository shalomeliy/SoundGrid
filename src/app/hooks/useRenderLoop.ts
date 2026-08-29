import { useEffect } from 'react'
import { engine } from '@/platform/audio-webaudio/engine'
import { clock } from '@/platform/clock-audio'
import { useStore } from '@/app/state/store'
import { shouldPushPosition } from '@/core/scratch'
import type { DeckId } from '@/core/types'

/**
 * Pushes each deck's authoritative playhead into the store so waveforms and
 * time readouts track smoothly.
 *
 * Subscribes to the Clock rather than owning a rAF loop of its own: everything
 * that needs per-frame time now reads the same authority, which is what keeps
 * sync, quantize and beat-timed effects from drifting apart later (v0.1.6).
 */
export function useRenderLoop() {
  useEffect(
    () =>
      clock.subscribe(() => {
        const { decks, patchDeck } = useStore.getState()
        ;(['A', 'B'] as DeckId[]).forEach((id) => {
          const d = engine.decks[id]
          if (!d.hasTrack) return
          const pos = d.position
          if (shouldPushPosition(pos, decks[id].positionSec, d.scratching)) {
            patchDeck(id, { positionSec: pos, playing: d.playing })
          } else if (d.playing !== decks[id].playing) {
            patchDeck(id, { playing: d.playing })
          }
        })
      }),
    [],
  )
}
