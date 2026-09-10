import { beatFractionToSeconds, equalPowerMix, FX_EFFECTS, type FxEffect } from '@/core/fx'

/** Wet ramp time for on/off — same declick shape as `sampler.ts`'s voice stop, a discrete transition rather than a continuous knob's `setTargetAtTime`. */
const DECLICK_SEC = 0.006

/** Feedback amount for Delay/Echo — enough repeats to be heard, short of runaway. */
const FEEDBACK_GAIN = 0.35

/**
 * One FX rack (v0.7.0) — a serial insert, like a guitar pedal: `input` in,
 * `output` out, and everything else (which effect, wet/dry, on/off) lives
 * inside. That is deliberate: toggling FX on/off happens constantly during
 * a live mix and must never touch the Web Audio graph outside this class —
 * only `engine.ts`'s routing (channel vs master, which is rare) does that,
 * by moving where `input`/`output` are connected. See `workshop-output/
 * PLAN.md` §3.6.
 *
 * Only Delay is implemented so far (v0.7.0 build order, PLAN.md §8 step 4);
 * Echo/Reverb/Filter are added one at a time in later commits. `setEffect`
 * on an unimplemented index throws rather than silently doing nothing —
 * there is no caller yet that can reach one (`core/fx.ts`'s `FX_EFFECTS`
 * and the UI/MIDI layers land together later), so a thrown error is a
 * broken build, not a runtime surprise a user could hit.
 */
export class FxRack {
  private ctx: AudioContext

  readonly input: GainNode
  readonly output: GainNode
  private dryGain: GainNode
  private wetGain: GainNode
  /** Ramped 0/1 on `setOn` — separate from `wetGain` (the wet/dry knob) so on/off never fights the knob's own value. */
  private onGain: GainNode

  private effectIndex = 0
  /** null until the first `setEffect` actually connects something — distinct from `effectIndex`'s default of 0, which is a valid index, not "nothing connected yet". */
  private activeEffect: FxEffect | null = null
  private effectInput: GainNode
  private effectOutput: GainNode
  /** Built once per effect on first `setEffect`, then reused — native nodes are cheap, no need to tear down and rebuild. */
  private effectNodes = new Map<FxEffect, { input: AudioNode; output: AudioNode }>()

  private currentBpm: number | null = null
  private currentFraction = 0.25

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
    switch (effect) {
      case 'delay': {
        const delay = this.ctx.createDelay(4) // 4s ceiling comfortably covers 4 beats down to ~15 BPM
        const feedback = this.ctx.createGain()
        feedback.gain.value = FEEDBACK_GAIN
        delay.connect(feedback)
        feedback.connect(delay)
        delay.delayTime.value = beatFractionToSeconds(this.currentBpm, this.currentFraction)
        this.effectNodes.set(effect, { input: delay, output: delay })
        break
      }
      case 'echo':
      case 'reverb':
      case 'filter':
        // Added in later commits (PLAN.md §8 steps 8). Not reachable yet —
        // core/fx.ts's FX_EFFECTS is not wired to any caller until then.
        throw new Error(`FX effect '${effect}' is not implemented yet`)
    }
  }

  /** Which effect is active, 0..3 into `FX_EFFECTS`. */
  setEffect(index: number) {
    const effect = FX_EFFECTS[index]
    if (!effect) throw new Error(`invalid FX effect index ${index}`)
    this.buildEffect(effect)
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
    this.effectIndex = index
    this.activeEffect = effect
    this.setTime(this.currentFraction, this.currentBpm)
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
    const effect = FX_EFFECTS[this.effectIndex]
    const now = this.ctx.currentTime
    if (effect === 'delay' || effect === 'echo') {
      const node = this.effectNodes.get(effect)?.input as DelayNode | undefined
      node?.delayTime.setTargetAtTime(sec, now, 0.01)
    }
    // Filter/Reverb interpret "time" differently — wired in when they land.
  }

  setOn(on: boolean) {
    const now = this.ctx.currentTime
    this.onGain.gain.setTargetAtTime(on ? 1 : 0, now, DECLICK_SEC)
  }
}
