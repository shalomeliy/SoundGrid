import { beatFractionToSeconds, equalPowerMix, FX_EFFECTS, type FxEffect } from '@/core/fx'

/** Wet ramp time for on/off — same declick shape as `sampler.ts`'s voice stop, a discrete transition rather than a continuous knob's `setTargetAtTime`. */
const DECLICK_SEC = 0.006

/** Feedback amount for Delay/Echo — enough repeats to be heard, short of runaway. */
const FEEDBACK_GAIN = 0.35

/** Reverb decay length is clamped to this range regardless of the computed beat time — a 1/4 beat at a fast BPM (~0.1s) would be too short to read as "reverb" at all, and nothing beyond 4s is worth the buffer size. */
const REVERB_DECAY_RANGE: readonly [number, number] = [0.2, 4]

interface EffectEntry {
  input: AudioNode
  output: AudioNode
  /** Effects that interpret "time" as more than their input node's own delayTime (Filter's sweep rate, Reverb's decay length) register this instead of being special-cased in `setTime`. */
  onTime?: (sec: number) => void
}

/**
 * One FX rack (v0.7.0) — a serial insert, like a guitar pedal: `input` in,
 * `output` out, and everything else (which effect, wet/dry, on/off) lives
 * inside. That is deliberate: toggling FX on/off happens constantly during
 * a live mix and must never touch the Web Audio graph outside this class —
 * only `engine.ts`'s routing (channel vs master, which is rare) does that,
 * by moving where `input`/`output` are connected. See `workshop-output/
 * PLAN.md` §3.6.
 *
 * All 4 effects use native Web Audio nodes only — no `AudioWorklet` in this
 * version (Bit Crusher/Roll, which do need one, are `v0.7.1`).
 */
export class FxRack {
  private ctx: AudioContext

  readonly input: GainNode
  readonly output: GainNode
  private dryGain: GainNode
  private wetGain: GainNode
  /** Ramped 0/1 on `setOn` — separate from `wetGain` (the wet/dry knob) so on/off never fights the knob's own value. */
  private onGain: GainNode

  /** null until the first `setEffect` actually connects something. */
  private activeEffect: FxEffect | null = null
  private effectInput: GainNode
  private effectOutput: GainNode
  /** Built once per effect on first `setEffect`, then reused — native nodes are cheap, no need to tear down and rebuild. */
  private effectNodes = new Map<FxEffect, EffectEntry>()

  private currentBpm: number | null = null
  private currentFraction = 0.25

  /**
   * False only if generating Reverb's impulse response threw. Checked before
   * `setEffect(2)` connects anything, so a broken Reverb never gets spliced
   * into the audio path — the UI (`FX_EFFECT_AVAILABLE` in `Mixer.tsx`,
   * checked per-rack via this getter once wired) shows "unavailable"
   * instead of the effect silently doing nothing, or nothing at all.
   */
  private _reverbAvailable = true
  get reverbAvailable() {
    return this._reverbAvailable
  }

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.dryGain = ctx.createGain()
    this.wetGain = ctx.createGain()
    this.onGain = ctx.createGain()
    this.onGain.gain.value = 0 // off by default

    this.effectInput = ctx.createGain()
    this.effectOutput = ctx.createGain()

    // dry path: input -> dryGain -> output (always connected, gain follows wet/dry knob)
    this.input.connect(this.dryGain)
    this.dryGain.connect(this.output)
    // wet path: input -> effectInput -> (active effect) -> effectOutput -> wetGain -> onGain -> output
    this.input.connect(this.effectInput)
    this.effectOutput.connect(this.wetGain)
    this.wetGain.connect(this.onGain)
    this.onGain.connect(this.output)

    this.applyWetDry(0) // fully dry until the UI/persistence sets a real value
    this.buildEffect('delay')
    this.setEffect(0)
  }

  private buildEffect(effect: FxEffect) {
    if (this.effectNodes.has(effect)) return
    const startSec = beatFractionToSeconds(this.currentBpm, this.currentFraction)
    switch (effect) {
      case 'delay': {
        // 4s ceiling comfortably covers 4 beats down to ~15 BPM.
        const delay = this.ctx.createDelay(4)
        const feedback = this.ctx.createGain()
        feedback.gain.value = FEEDBACK_GAIN
        delay.connect(feedback)
        feedback.connect(delay)
        delay.delayTime.value = startSec
        this.effectNodes.set(effect, {
          input: delay,
          output: delay,
          onTime: (sec) => delay.delayTime.setTargetAtTime(sec, this.ctx.currentTime, 0.01),
        })
        break
      }
      case 'echo': {
        // Same feedback-delay shape as Delay, but a lowpass in the feedback
        // loop only (not the dry/wet path) so repeats darken over time —
        // audibly distinct from Delay's flat repeats, tape-echo-like.
        const delay = this.ctx.createDelay(4)
        const fbFilter = this.ctx.createBiquadFilter()
        fbFilter.type = 'lowpass'
        fbFilter.frequency.value = 2500
        const feedback = this.ctx.createGain()
        feedback.gain.value = FEEDBACK_GAIN
        delay.connect(fbFilter)
        fbFilter.connect(feedback)
        feedback.connect(delay)
        delay.delayTime.value = startSec
        this.effectNodes.set(effect, {
          input: delay,
          output: delay,
          onTime: (sec) => delay.delayTime.setTargetAtTime(sec, this.ctx.currentTime, 0.01),
        })
        break
      }
      case 'reverb': {
        const convolver = this.ctx.createConvolver()
        convolver.normalize = true
        this.setReverbBuffer(convolver, startSec)
        this.effectNodes.set(effect, {
          input: convolver,
          output: convolver,
          onTime: (sec) => this.setReverbBuffer(convolver, sec),
        })
        break
      }
      case 'filter': {
        // Auto filter-sweep — an LFO driving the cutoff, not the static
        // per-channel Filter knob already on `ChannelStrip` (Mixer.tsx):
        // that one is a fixed HPF/LPF position the DJ sets and leaves;
        // this one moves on its own, synced to the beat. Confirmed with
        // Shalom (workshop-output/FEATURE_SPEC.md) after the name collision
        // surfaced during technical planning.
        const filter = this.ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 1000
        filter.Q.value = 4
        const lfo = this.ctx.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = 1 / startSec
        const depth = this.ctx.createGain()
        depth.gain.value = 800 // sweep range: ~200Hz..1800Hz around the 1000Hz center
        lfo.connect(depth)
        depth.connect(filter.frequency)
        lfo.start()
        this.effectNodes.set(effect, {
          input: filter,
          output: filter,
          onTime: (sec) => lfo.frequency.setTargetAtTime(1 / sec, this.ctx.currentTime, 0.01),
        })
        break
      }
    }
  }

  /**
   * (Re)generate Reverb's impulse response — white noise shaped with an
   * exponential decay, generated in code rather than a sourced/downloaded
   * IR file. Required, not a style choice: `CLAUDE.md`'s "zero assets from
   * any commercial product" rule rules out bundling someone else's IR.
   * Regenerating on every `setTime` (rather than only scaling an AudioParam)
   * is the cost of Reverb's "time" meaning decay length, not a delay — a
   * `ConvolverNode`'s buffer has no such continuous parameter. Wrapped so a
   * failure (buffer allocation OOM, the realistic case) degrades visibly:
   * `reverbAvailable` flips false and the UI shows it, per this project's
   * central rule.
   */
  private setReverbBuffer(convolver: ConvolverNode, decaySec: number) {
    const clamped = Math.max(REVERB_DECAY_RANGE[0], Math.min(REVERB_DECAY_RANGE[1], decaySec))
    try {
      const length = Math.max(1, Math.round(this.ctx.sampleRate * clamped))
      const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate)
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch)
        for (let i = 0; i < length; i++) {
          const decay = Math.pow(1 - i / length, 2.5)
          data[i] = (Math.random() * 2 - 1) * decay
        }
      }
      convolver.buffer = buffer
      this._reverbAvailable = true
    } catch {
      this._reverbAvailable = false
      convolver.buffer = null
    }
  }

  /**
   * Which effect is active, 0..3 into `FX_EFFECTS`. Returns whether it
   * actually switched — a Reverb whose impulse response failed to generate
   * is never connected, so the caller (`controls.ts`'s `setFxEffect`) must
   * check this before recording the new effect as selected: patching the
   * store regardless would show "Reverb" chosen while the rack keeps
   * playing whatever it had before, exactly the silent state-vs-reality gap
   * this project's central rule forbids.
   */
  setEffect(index: number): boolean {
    const effect = FX_EFFECTS[index]
    if (!effect) throw new Error(`invalid FX effect index ${index}`)
    this.buildEffect(effect)
    if (effect === 'reverb' && !this._reverbAvailable) return false
    const next = this.effectNodes.get(effect)
    if (!next) throw new Error(`FX effect '${effect}' failed to build`)

    if (this.activeEffect) {
      const current = this.effectNodes.get(this.activeEffect)
      if (current) {
        this.effectInput.disconnect(current.input)
        current.output.disconnect(this.effectOutput)
      }
    }
    this.effectInput.connect(next.input)
    next.output.connect(this.effectOutput)
    this.activeEffect = effect
    this.setTime(this.currentFraction, this.currentBpm)
    return true
  }

  /** 0 = fully dry, 1 = fully wet. */
  setWetDry(v: number) {
    this.applyWetDry(v)
  }

  private applyWetDry(v: number) {
    const { dry, wet } = equalPowerMix(v)
    const now = this.ctx.currentTime
    this.dryGain.gain.setTargetAtTime(dry, now, 0.01)
    this.wetGain.gain.setTargetAtTime(wet, now, 0.01)
  }

  /** Beat-synced time for the active effect — `fraction` is one of `core/fx.ts`'s `FX_TIME_STEPS`. */
  setTime(fraction: number, bpm: number | null) {
    this.currentFraction = fraction
    this.currentBpm = bpm
    const sec = beatFractionToSeconds(bpm, fraction)
    if (this.activeEffect) this.effectNodes.get(this.activeEffect)?.onTime?.(sec)
  }

  setOn(on: boolean) {
    const now = this.ctx.currentTime
    this.onGain.gain.setTargetAtTime(on ? 1 : 0, now, DECLICK_SEC)
  }
}
