import { engine } from '../audio/engine'
import type { Cancel, Clock } from '../core/ports'

/**
 * The Clock over `audioContext.currentTime`.
 *
 * One rAF loop for the whole app, fanned out to subscribers. Before this, each
 * consumer that wanted per-frame updates started its own loop and read its own
 * time source; the point of the seam is that they now all see the same number.
 *
 * `schedule` resolves on frame boundaries (~16ms), which is right for UI-level
 * work — cue flashes, readouts, deck-state polling. Anything that must land on
 * a sample stays inside the audio backend, where Web Audio's own scheduler is.
 */
class AudioClock implements Clock {
  readonly source = 'audio' as const

  private ticks = new Set<(t: number) => void>()
  private timers: { at: number; fn: () => void }[] = []
  private raf = 0

  now(): number {
    return engine.currentTime
  }

  subscribe(onTick: (t: number) => void): Cancel {
    this.ticks.add(onTick)
    this.start()
    return () => {
      this.ticks.delete(onTick)
      this.stopIfIdle()
    }
  }

  schedule(atSec: number, fn: () => void): Cancel {
    const entry = { at: atSec, fn }
    this.timers.push(entry)
    this.start()
    return () => {
      const i = this.timers.indexOf(entry)
      if (i >= 0) this.timers.splice(i, 1)
      this.stopIfIdle()
    }
  }

  private start() {
    if (this.raf) return
    const tick = () => {
      const t = this.now()
      if (this.timers.length) {
        // splice out everything due before notifying, so a callback that
        // schedules again doesn't get run twice in the same frame
        const due = this.timers.filter((e) => e.at <= t)
        if (due.length) {
          this.timers = this.timers.filter((e) => e.at > t)
          for (const e of due) e.fn()
        }
      }
      for (const fn of this.ticks) fn(t)
      this.raf = this.ticks.size || this.timers.length ? requestAnimationFrame(tick) : 0
    }
    this.raf = requestAnimationFrame(tick)
  }

  private stopIfIdle() {
    if (this.raf && !this.ticks.size && !this.timers.length) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
  }
}

export const clock: Clock = new AudioClock()
