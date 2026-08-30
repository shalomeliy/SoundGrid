import { useEffect } from 'react'
import { engine } from '@/platform/audio-webaudio/engine'
import { clock } from '@/platform/clock-audio'
import { settings } from '@/platform/settings-idb/store'
import { useStore } from '@/app/state/store'
import { shouldPushPosition } from '@/core/scratch'
import { shouldRepaint } from '@/core/settings'
import type { DeckId } from '@/core/types'

/**
 * Pushes each deck's authoritative playhead into the store so waveforms and
 * time readouts track smoothly.
 *
 * Subscribes to the Clock rather than owning a rAF loop of its own: everything
 * that needs per-frame time now reads the same authority, which is what keeps
 * sync, quantize and beat-timed effects from drifting apart later (v0.1.6).
 *
 * **The frame cap lives here, not in the canvas.** Every repaint downstream —
 * both waveforms, both platters, the time readouts — is caused by a position
 * push out of this loop, so one gate here bounds all of them. Capping inside
 * each canvas would leave the store writes and the React renders happening at
 * full rate, which is most of the cost.
 *
 * The clock itself is deliberately not throttled: it is the shared time
 * authority that sync and quantize will read, and slowing it to suit the screen
 * would make a display preference into an audio-timing decision.
 */
export function useRenderLoop() {
  useEffect(() => {
    let lastPush = 0
    return clock.subscribe(() => {
        const { decks, patchDeck } = useStore.getState()
        const now = performance.now()
        const scratching = engine.decks.A.scratching || engine.decks.B.scratching
        if (!shouldRepaint(now, lastPush, settings.values.maxFps, scratching)) return
        lastPush = now
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
      })
  }, [])
}
