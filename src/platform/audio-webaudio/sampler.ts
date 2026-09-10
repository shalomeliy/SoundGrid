import { SAMPLER_SLOT_COUNT } from '@/core/sampler'

/**
 * Fade time for starting/stopping a voice. Short enough that a pad hit feels
 * instant, long enough to kill the click a bare `start`/`stop` on an
 * arbitrary sample boundary produces — these are short, often percussive
 * hits where that pop would be the first thing anyone notices.
 */
const DECLICK_SEC = 0.006

interface Voice {
  buffer: AudioBuffer | null
  /** persistent — this slot's own fader (`SamplerSlot.gain`). Never ramped to 0 by declicking; that is `declick`'s job. */
  fader: GainNode
  /** the live playing note, if any. A fresh one is created per trigger — one-shots retrigger from zero, so there is nothing to "resume". */
  current: { source: AudioBufferSourceNode; declick: GainNode } | null
}

/**
 * The sampler bank's playback engine (v0.6.0) — `SAMPLER_SLOT_COUNT`
 * independent voices sharing one bus, wired to master/cue by `AudioEngine`
 * exactly the way `Deck` wires its own `faderGain`/`cueGain`. Mode logic
 * (one-shot retrigger, loop toggle, gated press/release) lives in
 * `controls.ts`'s `pressSamplerPad` — this class only ever does what it's
 * told: start a voice, stop a voice, follow the master's tempo.
 */
export class SamplerEngine {
  private ctx: AudioContext
  private voices: Voice[]

  /** A voice ended on its own (a one-shot or gated note ran out) — `controls.ts` clears the pad's `playing` flag from this instead of polling. */
  onSlotEnded?: (index: number) => void

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx
    this.voices = Array.from({ length: SAMPLER_SLOT_COUNT }, () => {
      const fader = ctx.createGain()
      fader.connect(destination)
      return { buffer: null, fader, current: null }
    })
  }

  loadSlot(index: number, buffer: AudioBuffer) {
    this.stopVoice(index)
    this.voices[index].buffer = buffer
  }

  unloadSlot(index: number) {
    this.stopVoice(index)
    this.voices[index].buffer = null
  }

  hasBuffer(index: number): boolean {
    return this.voices[index].buffer != null
  }

  setGain(index: number, v: number) {
    this.voices[index].fader.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  /**
   * Start a voice — always a fresh `AudioBufferSourceNode`, so calling this
   * on an already-playing slot is exactly a one-shot's retrigger-from-zero.
   * `loop` toggling (call again to stop) is `controls.ts`'s job, matching
   * every other pad mode's own toggle sitting in that file, not the engine.
   */
  trigger(index: number, loop: boolean, rate: number) {
    const voice = this.voices[index]
    if (!voice.buffer) return
    // A retrigger's outgoing voice gets the same declick fade-out a normal
    // stop does — `stopSource(voice, 0)` would schedule no ramp at all
    // (only `fadeSec > 0` ramps) and still hard-stop the node moments
    // later, clicking on every retrigger of an already-sounding one-shot.
    this.stopSource(voice, DECLICK_SEC)
    const src = this.ctx.createBufferSource()
    src.buffer = voice.buffer
    src.loop = loop
    src.playbackRate.value = rate
    const declick = this.ctx.createGain()
    const now = this.ctx.currentTime
    declick.gain.setValueAtTime(0, now)
    declick.gain.linearRampToValueAtTime(1, now + DECLICK_SEC)
    src.connect(declick)
    declick.connect(voice.fader)
    src.onended = () => {
      if (voice.current?.source === src) {
        voice.current = null
        this.onSlotEnded?.(index)
      }
    }
    src.start(0)
    voice.current = { source: src, declick }
  }

  /** Stop this slot's voice with a declick fade, if one is playing. A no-op otherwise — safe to call unconditionally on a gated release or a mode switch away from Loop. */
  stopVoice(index: number) {
    this.stopSource(this.voices[index], DECLICK_SEC)
  }

  /** Live tempo follow (v0.6.0): a playing, sync-enabled loop's rate moves with the master deck's tempo, the same "stays in sync" contract the deck-to-deck SYNC loop already gives `syncActive` decks. A no-op on a stopped or unloaded slot. */
  setRate(index: number, rate: number) {
    const current = this.voices[index].current
    if (current) current.source.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.02)
  }

  private stopSource(voice: Voice, fadeSec: number) {
    const current = voice.current
    if (!current) return
    const { source, declick } = current
    voice.current = null
    source.onended = null
    const now = this.ctx.currentTime
    if (fadeSec > 0) {
      declick.gain.cancelScheduledValues(now)
      declick.gain.setValueAtTime(declick.gain.value, now)
      declick.gain.linearRampToValueAtTime(0, now + fadeSec)
    }
    window.setTimeout(
      () => {
        try {
          source.stop()
        } catch {
          /* already stopped */
        }
        source.disconnect()
        declick.disconnect()
      },
      fadeSec * 1000 + 10,
    )
  }
}
