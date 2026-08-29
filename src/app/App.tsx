import { useEffect } from 'react'
import { Deck } from '@/app/components/Deck'
import { Library } from '@/app/components/Library'
import { Mixer } from '@/app/components/Mixer'
import { TopBar } from '@/app/components/TopBar'
import * as ctl from '@/controls'
import { KEYBOARD_BEND } from '@/core/constants'
import { useRenderLoop } from '@/app/hooks/useRenderLoop'
import type { DeckId } from '@/core/types'

export default function App() {
  useRenderLoop()

  useEffect(() => {
    /**
     * Bend keys, mirrored like the rest of the map: deck A on the left of the
     * keyboard beside its cue key, deck B on the right beside its own.
     *
     * Bend only — there is deliberately no scratch key. A scratch is a
     * continuous gesture with a speed, and a key has no speed; a "scratch key"
     * would look like the feature and not be it.
     */
    const bendKeys: Record<string, [DeckId, number]> = {
      KeyS: ['A', -KEYBOARD_BEND],
      KeyD: ['A', KEYBOARD_BEND],
      KeyK: ['B', -KEYBOARD_BEND],
      KeyL: ['B', KEYBOARD_BEND],
    }
    /**
     * Which bend keys are physically down. Needed because two of them can be
     * held at once and because the OS repeats a held key: without this, the
     * second key's release would end a bend the first key is still asking for.
     */
    const bending = new Set<string>()

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      const bend = bendKeys[e.code]
      if (bend) {
        // Auto-repeat re-sends keydown while the key is simply still down. It
        // is not a new press, and re-applying would restart the bend on every
        // repeat, so the decay never gets to run.
        if (e.repeat || bending.has(e.code)) return
        bending.add(e.code)
        ctl.bendDeck(bend[0], bend[1])
        return
      }

      switch (e.code) {
        case 'KeyQ':
          ctl.togglePlay('A')
          break
        case 'KeyP':
          ctl.togglePlay('B')
          break
        case 'KeyA':
          ctl.cue('A')
          break
        case 'Semicolon':
          ctl.cue('B')
          break
        case 'ArrowUp':
          ctl.moveSelection(-1)
          e.preventDefault()
          break
        case 'ArrowDown':
          ctl.moveSelection(1)
          e.preventDefault()
          break
        case 'BracketLeft': {
          const t = ctl.selectedTrack()
          if (t) void ctl.loadTrackToDeck('A', t)
          break
        }
        case 'BracketRight': {
          const t = ctl.selectedTrack()
          if (t) void ctl.loadTrackToDeck('B', t)
          break
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const bend = bendKeys[e.code]
      if (!bend || !bending.delete(e.code)) return
      // Only the last bend key for this deck releases it: letting go of one
      // while the other is still held should leave that one bending.
      const stillHeld = Object.entries(bendKeys).some(
        ([code, [deck]]) => deck === bend[0] && bending.has(code),
      )
      if (!stillHeld) ctl.releaseBend(bend[0])
    }

    /**
     * A key held while the window loses focus never sends its keyup, and the
     * deck would stay bent with nothing on screen saying why. Releasing on blur
     * is the visible-degradation rule applied to a stuck key.
     */
    const onBlur = () => {
      for (const code of bending) {
        const bend = bendKeys[code]
        if (bend) ctl.releaseBend(bend[0])
      }
      bending.clear()
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar />
      <main className="grid shrink-0 grid-cols-[1fr_auto_1fr] gap-3 p-3">
        <Deck deckId="A" />
        <Mixer />
        <Deck deckId="B" />
      </main>
      <div className="min-h-[200px] flex-1 px-3 pb-3">
        <Library />
      </div>
    </div>
  )
}
