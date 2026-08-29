import { useEffect } from 'react'
import { Deck } from '@/app/components/Deck'
import { Library } from '@/app/components/Library'
import { Mixer } from '@/app/components/Mixer'
import { TopBar } from '@/app/components/TopBar'
import * as ctl from '@/controls'
import { useRenderLoop } from '@/app/hooks/useRenderLoop'

export default function App() {
  useRenderLoop()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
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
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
