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
  setLoop(startSec: number, endSec: number): void
  clearLoop(): void
  readonly positionSec: number
  onEnd?: () => void
  dispose(): void
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

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
      this.source.playbackRate.setValueAtTime(rate, this.ctx.currentTime)
    }
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

  private node: AudioWorkletNode
  private rateParam: AudioParam
  private durationSec = 0
  private playing = false
  private rate = 1
  private epoch = 0

  /** newest accepted anchor: where the pointer was, and when */
  private anchorPos = 0
  private anchorCtxTime = 0

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
  }

  private onWorkletMessage(msg: { type: string; epoch: number; positionSec: number }) {
    // Anything stamped with a superseded epoch is describing a world that no
    // longer exists — a seek has happened since it was sent. Accepting it would
    // overwrite the new position with the old one and snap the playhead back.
    if (msg.epoch !== this.epoch) return
    if (msg.type === 'anchor') {
      this.anchorPos = msg.positionSec
      this.anchorCtxTime = this.ctx.currentTime
    } else if (msg.type === 'ended') {
      this.anchorPos = msg.positionSec
      this.anchorCtxTime = this.ctx.currentTime
      this.playing = false
      this.onEnd?.()
    }
  }

  load(buffer: AudioBuffer) {
    const channels: Float32Array[] = []
    const transfer: ArrayBuffer[] = []
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      // copyFromChannel into our own array rather than transferring the
      // AudioBuffer's own storage: transferring that detaches the AudioBuffer
      // itself, and callers upstream are entitled to still hold a live one.
      // Peak memory is briefly 2x, steady state is 1x — the samples live here
      // and nowhere else once decode's buffer is released.
      const data = new Float32Array(buffer.length)
      buffer.copyFromChannel(data, c)
      channels.push(data)
      transfer.push(data.buffer)
    }
    this.durationSec = buffer.duration
    this.playing = false
    this.anchorPos = 0
    this.anchorCtxTime = this.ctx.currentTime
    this.post({ type: 'load', channels }, transfer)
  }

  unload() {
    this.durationSec = 0
    this.playing = false
    this.anchorPos = 0
    this.post({ type: 'unload' })
  }

  get positionSec(): number {
    if (this.durationSec === 0) return 0
    if (!this.playing) return clamp(this.anchorPos, 0, this.durationSec)
    // Extrapolate from the newest anchor at the rate we commanded. Exact at
    // each anchor, sub-frame between them — and no message per render quantum.
    const pos = this.anchorPos + (this.ctx.currentTime - this.anchorCtxTime) * this.rate
    return clamp(pos, 0, this.durationSec)
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
    this.rate = rate
    this.rateParam.setValueAtTime(rate, this.ctx.currentTime)
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
