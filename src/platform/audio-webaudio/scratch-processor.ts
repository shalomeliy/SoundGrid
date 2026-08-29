/**
 * The deck's sample player, running on the audio thread.
 *
 * Why this exists at all: Chrome's `AudioBufferSourceNode` cannot scratch.
 * Measured in Chrome 148 through an OfflineAudioContext — at `playbackRate`
 * -1, -0.5 or 0 it neither reverses nor goes silent; the read pointer freezes
 * and the node emits its last sample as a DC offset. Scratching needs a read
 * pointer that can travel backwards and stop, so the deck owns one here.
 *
 * This file must import nothing. An AudioWorkletGlobalScope has no DOM and no
 * module graph worth speaking of; one accidental transitive import of anything
 * DOM-touching turns into an opaque `addModule` rejection at runtime. That is
 * also why `tempoToRate`'s arithmetic is not reused from `core/constants` —
 * see RATE below.
 */

/** Ramp length for the anti-click gain, in seconds. */
const DECLICK_SEC = 0.005

/**
 * Below this |rate| the output is faded out. A held read pointer emits its
 * interpolated sample forever, which is a DC offset, not silence — measured,
 * and audible as a thump at the bottom of a vinyl brake. A turntable at rest
 * is silent, so this fades instead of holding.
 */
const SILENT_BELOW_RATE = 0.02

/** Render quanta between position anchors — 8 quanta ≈ 43 Hz at 44.1 kHz. */
const ANCHOR_EVERY_QUANTA = 8

type InMessage =
  | { type: 'load'; channels: Float32Array[]; epoch: number }
  | { type: 'seek'; positionSec: number; epoch: number }
  | { type: 'playing'; playing: boolean; epoch: number }
  | { type: 'loop'; startSec: number | null; endSec: number | null }
  | { type: 'unload'; epoch: number }

class ScratchProcessor extends AudioWorkletProcessor {
  /**
   * Signed playback rate, in frames per frame. a-rate on purpose: the vinyl
   * braking curve is then just `linearRampToValueAtTime` on this param,
   * evaluated per sample inside the quantum. Sending rate as port messages
   * instead would give a staircase — no timeline, no ramp, zipper noise on a
   * fast jog.
   */
  static get parameterDescriptors() {
    return [{ name: 'rate', defaultValue: 1, automationRate: 'a-rate' as const }]
  }

  private channels: Float32Array[] = []
  private frames = 0
  /** read position, in frames — fractional, and free to run backwards */
  private pos = 0
  private playing = false
  private epoch = 0
  private loopStart: number | null = null
  private loopEnd: number | null = null
  private ended = false

  private gain = 0
  private declickStep = 1 / (DECLICK_SEC * sampleRate)
  private quantaSinceAnchor = 0

  constructor(options?: AudioWorkletNodeOptions) {
    super(options)
    this.port.onmessage = (e: MessageEvent<InMessage>) => this.handle(e.data)
  }

  private handle(msg: InMessage) {
    switch (msg.type) {
      case 'load':
        this.channels = msg.channels
        this.frames = msg.channels[0]?.length ?? 0
        this.pos = 0
        this.playing = false
        this.ended = false
        this.loopStart = this.loopEnd = null
        this.epoch = msg.epoch
        // Silence first, then ramp in. Landing mid-waveform at full gain is a
        // step discontinuity, which is exactly what a click is.
        this.gain = 0
        break
      case 'seek':
        this.pos = this.clampFrames(msg.positionSec * sampleRate)
        this.ended = false
        this.epoch = msg.epoch
        this.gain = 0
        this.postAnchor()
        break
      case 'playing':
        this.playing = msg.playing
        this.epoch = msg.epoch
        if (!msg.playing) this.postAnchor()
        break
      case 'loop':
        this.loopStart = msg.startSec === null ? null : msg.startSec * sampleRate
        this.loopEnd = msg.endSec === null ? null : msg.endSec * sampleRate
        break
      case 'unload':
        this.channels = []
        this.frames = 0
        this.pos = 0
        this.playing = false
        this.epoch = msg.epoch
        break
    }
  }

  private clampFrames(f: number) {
    return f < 0 ? 0 : f > this.frames ? this.frames : f
  }

  private postAnchor() {
    // An anchor, not a position: {epoch, where, when}. The main thread
    // extrapolates from the newest anchor at the rate it commanded, so it stays
    // sample-accurate without a message per quantum (~344/s at 44.1 kHz), and
    // it discards anchors from a stale epoch — otherwise an anchor still in
    // flight when a seek lands overwrites the new position and the playhead
    // visibly snaps back.
    this.port.postMessage({
      type: 'anchor',
      epoch: this.epoch,
      positionSec: this.pos / sampleRate,
      ctxTimeSec: currentTime,
    })
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    params: Record<string, Float32Array>,
  ): boolean {
    const out = outputs[0]
    const n = out[0]?.length ?? 0
    const chans = this.channels
    const nCh = chans.length

    if (nCh === 0 || this.frames === 0 || !this.playing) {
      // Nothing to render. Outputs arrive zero-filled, so leaving them alone is
      // silence. Keep the processor alive: the node persists across
      // play/pause/seek for the life of the deck.
      this.gain = 0
      return true
    }

    const rateParam = params.rate
    const constantRate = rateParam.length === 1
    let rate = 0

    for (let i = 0; i < n; i++) {
      rate = constantRate ? rateParam[0] : rateParam[i]

      const target = Math.abs(rate) < SILENT_BELOW_RATE ? 0 : 1
      // Snap to the target once within one step of it. Stepping unconditionally
      // and clamping afterwards makes the gain overshoot 1, come back down, and
      // overshoot again — a 0.45% amplitude wobble alternating every sample,
      // i.e. modulation at Nyquist. Inaudible on its own and invisible in a
      // waveform; it showed up as exactly half the samples failing a
      // bit-identical comparison against the AudioBufferSourceNode path.
      if (this.gain < target) this.gain = Math.min(target, this.gain + this.declickStep)
      else if (this.gain > target) this.gain = Math.max(target, this.gain - this.declickStep)

      const p = this.pos
      if (p < 0 || p >= this.frames - 1) {
        for (let c = 0; c < nCh; c++) out[c][i] = 0
      } else {
        const i0 = p | 0
        const frac = p - i0
        const g = this.gain
        if (frac === 0) {
          // Rate 1.0 from an integer offset keeps the pointer integral, so this
          // returns the stored sample untouched — that is what makes normal
          // playback bit-identical to the AudioBufferSourceNode it replaced.
          for (let c = 0; c < nCh; c++) out[c][i] = chans[c][i0] * g
        } else {
          for (let c = 0; c < nCh; c++) {
            const d = chans[c]
            out[c][i] = (d[i0] + (d[i0 + 1] - d[i0]) * frac) * g
          }
        }
      }

      let next = p + rate
      if (this.loopStart !== null && this.loopEnd !== null && this.loopEnd > this.loopStart) {
        const span = this.loopEnd - this.loopStart
        if (next >= this.loopEnd) next = this.loopStart + ((next - this.loopStart) % span)
        else if (next < this.loopStart) next = this.loopEnd - ((this.loopStart - next) % span)
      }
      this.pos = next
    }

    // End of track. A worklet node has no `onended`, so this has to be said out
    // loud — without it `playing` stays true forever at the end of a track and
    // nothing on screen ever says the deck stopped.
    // Which end counts depends on which way we were travelling: running off
    // the front at a negative rate is just as much "the track ended" as running
    // off the back. Testing `pos <= 0` unconditionally would fire the moment a
    // deck is played from the very start.
    const hitEdge = rate < 0 ? this.pos <= 0 : this.pos >= this.frames - 1
    if (!this.ended && this.loopEnd === null && hitEdge) {
      this.ended = true
      this.playing = false
      this.pos = this.clampFrames(this.pos)
      this.port.postMessage({
        type: 'ended',
        epoch: this.epoch,
        positionSec: this.pos / sampleRate,
      })
    } else if (++this.quantaSinceAnchor >= ANCHOR_EVERY_QUANTA) {
      this.quantaSinceAnchor = 0
      this.postAnchor()
    }

    return true
  }
}

registerProcessor('scratch-player', ScratchProcessor)
