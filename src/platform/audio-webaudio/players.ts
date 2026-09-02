/**
 * The deck's source stage, behind one small interface with two implementations.
 *
 * Only the *source node* differs between them. Trim, the three EQ bands, the
 * filters, channel/fader/cue gains and the whole connect chain are identical
 * and have nothing to do with scratching, so `Deck` keeps owning them and only
 * swaps what sits at the head of the chain. Two full `DeckBackend`
 * implementations would mean duplicating ~120 lines of routing to vary one node.
 *
 * `BufferSourcePlayer` is the original engine, unchanged in behaviour. It is
 * the fallback for when the worklet module cannot load — and when it is in use,
 * scratching is genuinely unavailable and the UI has to say so rather than
 * quietly degrading to a seek.
 */

export interface SourcePlayer {
  readonly kind: 'buffer' | 'worklet'
  /** true when this player can run the read pointer backwards or hold it */
  readonly canScratch: boolean
  load(buffer: AudioBuffer): void
  unload(): void
  start(offsetSec: number): void
  stop(): void
  seek(sec: number): void
  setRate(rate: number): void
  /**
   * Glide the rate to `target` over `seconds` — a turntable spinning down or
   * up rather than the rate stepping. Players that cannot run backwards treat
   * a target at or below standstill as a stop.
   */
  rampRate(target: number, seconds: number): void
  setLoop(startSec: number, endSec: number): void
  clearLoop(): void
  readonly positionSec: number
  onEnd?: () => void
  dispose(): void
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

/** Below this the platter counts as stopped: the worklet already fades to
 *  silence here, and a rate this small moves the pointer by nothing audible. */
const STANDSTILL = 0.02

/** The pre-v0.2.0 engine: one AudioBufferSourceNode per start, recreated on seek. */
export class BufferSourcePlayer implements SourcePlayer {
  readonly kind = 'buffer'
  readonly canScratch = false
  onEnd?: () => void

  private source: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null
  private playing = false
  private startCtxTime = 0
  private startOffset = 0
  private rate = 1
  private loopStart: number | null = null
  private loopEnd: number | null = null

  private ctx: AudioContext
  private destination: AudioNode

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx
    this.destination = destination
  }

  load(buffer: AudioBuffer) {
    this.stop()
    this.buffer = buffer
    this.startOffset = 0
    this.loopStart = this.loopEnd = null
  }

  unload() {
    this.stop()
    this.buffer = null
    this.startOffset = 0
  }

  get positionSec(): number {
    const dur = this.buffer?.duration ?? 0
    if (!this.buffer) return 0
    if (!this.playing) return clamp(this.startOffset, 0, dur)
    const elapsed = (this.ctx.currentTime - this.startCtxTime) * this.rate
    let pos = this.startOffset + elapsed
    if (this.loopStart !== null && this.loopEnd !== null && pos >= this.loopEnd) {
      const span = this.loopEnd - this.loopStart
      pos = this.loopStart + ((pos - this.loopStart) % span)
    }
    return clamp(pos, 0, dur)
  }

  start(offsetSec: number) {
    if (!this.buffer) return
    this.stopNode()
    const src = this.ctx.createBufferSource()
    src.buffer = this.buffer
    src.playbackRate.value = this.rate
    if (this.loopStart !== null && this.loopEnd !== null) {
      src.loop = true
      src.loopStart = this.loopStart
      src.loopEnd = this.loopEnd
    }
    src.connect(this.destination)
    src.onended = () => {
      // Seek and stop also fire onended; only a genuine end-of-track should
      // reach the deck. Comparing identity is what tells them apart.
      if (this.source === src && this.playing) {
        this.playing = false
        this.startOffset = this.buffer?.duration ?? 0
        this.onEnd?.()
      }
    }
    src.start(0, offsetSec)
    this.source = src
    this.playing = true
    this.startCtxTime = this.ctx.currentTime
    this.startOffset = offsetSec
  }

  stop() {
    if (this.playing) this.startOffset = this.positionSec
    this.stopNode()
    this.playing = false
  }

  seek(sec: number) {
    const wasPlaying = this.playing
    this.stopNode()
    this.playing = false
    this.startOffset = clamp(sec, 0, this.buffer?.duration ?? 0)
    if (wasPlaying) this.start(this.startOffset)
  }

  setRate(rate: number) {
    this.rate = rate
    if (this.source) {
      // keep position continuous across a rate change
      this.startOffset = this.positionSec
      this.startCtxTime = this.ctx.currentTime
      // Cancel first, same as rampRate below: v0.3.0's syncNudge routinely
      // leaves a linearRampToValueAtTime scheduled up to half a second out,
      // and grabbing the tempo fader mid-correction is the exact moment
      // setTempo -> setRate is meant to win. Without this the old ramp's
      // endpoint could still fire on this fallback path and glitch the rate.
      this.source.playbackRate.cancelScheduledValues(this.ctx.currentTime)
      this.source.playbackRate.setValueAtTime(rate, this.ctx.currentTime)
    }
  }

  /**
   * Degraded: this node cannot pass through zero — at rate 0 it freezes the
   * read pointer and emits the last sample as DC (measured in Chrome 148), so
   * a brake here ends in a stop rather than a held platter.
   */
  rampRate(target: number, seconds: number) {
    if (!this.source) return
    if (target <= STANDSTILL) {
      this.stop()
      return
    }
    const now = this.ctx.currentTime
    this.source.playbackRate.cancelScheduledValues(now)
    this.source.playbackRate.setValueAtTime(this.source.playbackRate.value, now)
    this.source.playbackRate.linearRampToValueAtTime(target, now + Math.max(0.001, seconds))
  }

  setLoop(startSec: number, endSec: number) {
    this.loopStart = startSec
    this.loopEnd = endSec
    if (this.source) {
      this.source.loopStart = startSec
      this.source.loopEnd = endSec
      this.source.loop = true
    }
  }

  clearLoop() {
    this.loopStart = this.loopEnd = null
    if (this.source) this.source.loop = false
  }

  dispose() {
    this.stopNode()
    this.buffer = null
  }

  private stopNode() {
    if (this.source) {
      this.source.onended = null
      try {
        this.source.stop()
      } catch {
        /* already stopped */
      }
      this.source.disconnect()
      this.source = null
    }
  }
}

/** The scratch-capable engine: one persistent worklet node with a signed read pointer. */
export class WorkletPlayer implements SourcePlayer {
  readonly kind = 'worklet'
  readonly canScratch = true
  onEnd?: () => void
  /** the worklet died mid-render; this deck renders nothing until reloaded */
  onProcessorError?: () => void

  private node: AudioWorkletNode
  private rateParam: AudioParam
  private durationSec = 0
  private playing = false
  private rate = 1
  private epoch = 0
  /** track identity as the processor sees it; only load/unload move it */
  private generation = 0

  /** newest accepted anchor: where the pointer was, and when */
  private anchorPos = 0
  private anchorCtxTime = 0

  /**
   * An in-flight rate ramp, if any. The read pointer travels the *integral* of
   * the rate, so while the rate is sloping the position is quadratic in time.
   * `positionSec` extrapolates between anchors, and extrapolating a brake at a
   * constant rate would run the playhead well past where the audio actually is
   * — visibly, on any brake shorter than the ~23ms anchor interval.
   */
  private ramp: { from: number; to: number; startTime: number; endTime: number } | null = null

  private ctx: AudioContext

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx
    this.node = new AudioWorkletNode(ctx, 'scratch-player', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    const rate = this.node.parameters.get('rate')
    if (!rate) throw new Error('scratch-player worklet exposes no `rate` parameter')
    this.rateParam = rate
    this.node.connect(destination)
    this.node.port.onmessage = (e: MessageEvent) => this.onWorkletMessage(e.data)
    // A throw inside process() puts the node into a permanent error state: it
    // stops rendering for the life of the deck and says nothing at all. This is
    // the difference between a reported fault and a deck that simply went quiet.
    this.node.onprocessorerror = () => {
      this.playing = false
      this.ramp = null
      this.onProcessorError?.()
      this.onEnd?.()
    }
  }

  private onWorkletMessage(msg: {
    type: string
    epoch: number
    generation: number
    positionSec: number
    ctxTimeSec: number
  }) {
    if (msg.type === 'anchor') {
      // A superseded epoch describes a world that no longer exists — a seek has
      // happened since it was sent. Accepting it would overwrite the new
      // position with the old one and snap the playhead back.
      if (msg.epoch !== this.epoch) return
      this.anchorPos = msg.positionSec
      // The processor's own clock reading, not the time this message happened
      // to be delivered. Stamping delivery time makes every anchor late by the
      // message-queue latency, which varies with main-thread load — so the
      // playhead jittered ~43x/sec against audio that was perfectly steady.
      this.anchorCtxTime = msg.ctxTimeSec
      return
    }

    if (msg.type === 'ended') {
      // `ended` is a terminal transition, not a position sample, so the epoch
      // filter must not apply to it: a seek near the end of a track bumps the
      // epoch before the message drains, the message is dropped, and nothing
      // ever clears `playing`. The processor has stopped, so `process()`
      // early-returns forever — a silent deck whose playhead still advances and
      // whose play button no-ops, recoverable only by pausing first.
      //
      // Generation is the right filter instead. It moves only on load/unload,
      // so an `ended` belonging to a previous track is still ignored, while one
      // belonging to *this* track always lands. Epoch cannot do that job: it
      // also moves on every seek, which is precisely the case being missed.
      if (msg.generation !== this.generation) return
      if (!this.playing) return
      this.anchorPos = msg.positionSec
      this.anchorCtxTime = msg.ctxTimeSec
      this.playing = false
      this.ramp = null
      this.onEnd?.()
    }
  }

  load(buffer: AudioBuffer) {
    // The deck chain downstream is stereo, and the worklet writes exactly the
    // channels the node declares. Anything past the second source channel would
    // therefore just vanish — where the AudioBufferSourceNode this replaced got
    // a spec downmix from Web Audio for free. Fold the extras in rather than
    // dropping them: a surround file must not quietly lose its centre channel.
    // (Mono is handled the other way round, inside the processor, by fanning
    // one source channel out to both outputs.)
    const srcChannels = buffer.numberOfChannels
    const outChannels = Math.min(srcChannels, 2)
    const channels: Float32Array[] = []
    const transfer: ArrayBuffer[] = []
    for (let c = 0; c < outChannels; c++) {
      // copyFromChannel into our own array rather than handing over the
      // AudioBuffer's own storage: only these copies are transferred, so the
      // caller's AudioBuffer is never detached and stays fully readable.
      // Peak memory is briefly 2x, steady state is 1x — the samples live here
      // and nowhere else once decode's buffer is released.
      const data = new Float32Array(buffer.length)
      buffer.copyFromChannel(data, c)
      channels.push(data)
      transfer.push(data.buffer)
    }
    if (srcChannels > outChannels) {
      // Equal-gain fold of every extra channel into both sides. Not the spec
      // downmix, which applies specific coefficients (0.7071 for centre and
      // surrounds in 5.1) and only defines a 5.1 layout — channel meaning is
      // not knowable for an arbitrary count, so a uniform fold is the honest
      // generic choice. Without it the loop bound above only narrows the
      // output and the extra channels are read by nobody.
      const extra = new Float32Array(buffer.length)
      const gain = 1 / (srcChannels - 1)
      for (let c = outChannels; c < srcChannels; c++) {
        buffer.copyFromChannel(extra, c)
        for (let i = 0; i < extra.length; i++) {
          channels[0][i] += extra[i] * gain
          channels[1][i] += extra[i] * gain
        }
      }
    }
    this.durationSec = buffer.duration
    this.playing = false
    this.anchorPos = 0
    this.anchorCtxTime = this.ctx.currentTime
    this.ramp = null
    this.generation++
    this.post({ type: 'load', channels }, transfer)
  }

  unload() {
    this.durationSec = 0
    this.playing = false
    this.anchorPos = 0
    this.ramp = null
    this.generation++
    this.post({ type: 'unload' })
  }

  /** How far the pointer travels between two context times, ramp included. */
  private travelled(from: number, to: number): number {
    if (to <= from) return 0
    const r = this.ramp
    if (!r) return (to - from) * this.rate

    let distance = 0
    // stretch before the ramp starts, at the old rate
    const preEnd = Math.min(to, r.startTime)
    if (preEnd > from) distance += (preEnd - from) * r.from
    // the sloping stretch: average of the endpoint rates over that span
    const slopeStart = Math.max(from, r.startTime)
    const slopeEnd = Math.min(to, r.endTime)
    if (slopeEnd > slopeStart) {
      const span = r.endTime - r.startTime
      const rateAt = (t: number) =>
        span <= 0 ? r.to : r.from + ((r.to - r.from) * (t - r.startTime)) / span
      distance += ((rateAt(slopeStart) + rateAt(slopeEnd)) / 2) * (slopeEnd - slopeStart)
    }
    // and whatever is left after it settles
    const postStart = Math.max(from, r.endTime)
    if (to > postStart) distance += (to - postStart) * r.to
    return distance
  }

  get positionSec(): number {
    if (this.durationSec === 0) return 0
    if (!this.playing) return clamp(this.anchorPos, 0, this.durationSec)
    // Exact at each anchor, sub-frame between them, and no message per render
    // quantum. `travelled` is what keeps that true through a ramp.
    const now = this.ctx.currentTime
    if (this.ramp && now >= this.ramp.endTime) {
      this.rate = this.ramp.to
      this.ramp = null
    }
    return clamp(this.anchorPos + this.travelled(this.anchorCtxTime, now), 0, this.durationSec)
  }

  start(offsetSec: number) {
    if (this.durationSec === 0) return
    this.seek(offsetSec)
    this.playing = true
    this.post({ type: 'playing', playing: true })
  }

  stop() {
    if (!this.playing) return
    this.anchorPos = this.positionSec
    this.anchorCtxTime = this.ctx.currentTime
    this.playing = false
    this.post({ type: 'playing', playing: false })
  }

  seek(sec: number) {
    this.ramp = null
    const pos = clamp(sec, 0, this.durationSec)
    this.anchorPos = pos
    this.anchorCtxTime = this.ctx.currentTime
    this.post({ type: 'seek', positionSec: pos })
  }

  setRate(rate: number) {
    // Rebase before changing rate, or the extrapolation from the old anchor
    // would be re-evaluated at the new rate and jump.
    this.anchorPos = this.positionSec
    this.anchorCtxTime = this.ctx.currentTime
    this.ramp = null
    this.rate = rate
    const now = this.ctx.currentTime
    this.rateParam.cancelScheduledValues(now)
    this.rateParam.setValueAtTime(rate, now)
  }

  rampRate(target: number, seconds: number) {
    const now = this.ctx.currentTime
    // Rebase first: everything travelled so far belongs to the old curve.
    this.anchorPos = this.positionSec
    this.anchorCtxTime = now
    const from = this.ramp ? this.rateAtNow() : this.rate
    const span = Math.max(0.001, seconds)
    this.rateParam.cancelScheduledValues(now)
    this.rateParam.setValueAtTime(from, now)
    this.rateParam.linearRampToValueAtTime(target, now + span)
    this.ramp = { from, to: target, startTime: now, endTime: now + span }
    this.rate = from
  }

  /** Current rate partway along an in-flight ramp. */
  private rateAtNow(): number {
    const r = this.ramp
    if (!r) return this.rate
    const now = this.ctx.currentTime
    if (now <= r.startTime) return r.from
    if (now >= r.endTime) return r.to
    return r.from + ((r.to - r.from) * (now - r.startTime)) / (r.endTime - r.startTime)
  }

  setLoop(startSec: number, endSec: number) {
    this.post({ type: 'loop', startSec, endSec }, undefined, false)
  }

  clearLoop() {
    this.post({ type: 'loop', startSec: null, endSec: null }, undefined, false)
  }

  dispose() {
    this.node.port.onmessage = null
    this.node.disconnect()
  }

  /** Every state-changing message carries a fresh epoch; loop edits do not move the pointer. */
  private post(msg: object, transfer?: ArrayBuffer[], bumpEpoch = true) {
    if (bumpEpoch) this.epoch++
    const payload = { ...msg, epoch: this.epoch }
    if (transfer) this.node.port.postMessage(payload, transfer)
    else this.node.port.postMessage(payload)
  }
}
