/**
 * A pure sink: tap `masterPostFx`, accumulate samples, hand them to the main
 * thread in chunks. Runs on the audio thread for the same reason
 * `scratch-processor.ts` does — copying every render quantum (128 frames,
 * ~344/sec at 44.1kHz) across a `postMessage` would be both slow and a
 * flood of tiny messages, so this batches into ~93ms chunks instead
 * (`CHUNK_FRAMES` frames) and transfers each one's buffers rather than
 * copying them across the thread boundary.
 *
 * This file must import nothing — see `scratch-processor.ts`'s doc comment
 * for why an AudioWorkletGlobalScope import turns into an opaque `addModule`
 * rejection.
 *
 * `numberOfOutputs: 0` (set by the node's constructor options, not here) is
 * deliberate: this node never plays anything back, only listens. A worklet
 * node with an active input keeps processing without any output connection
 * — the standard "tap/analyser" shape, and why `recorder-tap.ts` never
 * connects this node onward to the destination.
 */

/** Frames per posted chunk — ~93ms at 44.1kHz, small enough that a stop() flush loses no more than that much tail audio. */
const CHUNK_FRAMES = 4096

type OutMessage = { type: 'chunk'; channels: Float32Array[]; frameCount: number }
type InMessage = { type: 'flush' }

class RecorderTapProcessor extends AudioWorkletProcessor {
  private channelBuffers: Float32Array[] = []
  private numChannels = 0
  private filled = 0

  constructor(options?: AudioWorkletNodeOptions) {
    super(options)
    this.port.onmessage = (e: MessageEvent<InMessage>) => {
      if (e.data.type === 'flush') this.flush()
    }
  }

  private ensureBuffers(numChannels: number) {
    if (this.numChannels === numChannels && this.channelBuffers.length) return
    this.numChannels = numChannels
    this.channelBuffers = Array.from({ length: numChannels }, () => new Float32Array(CHUNK_FRAMES))
    this.filled = 0
  }

  /**
   * `.slice()` copies into a fresh `ArrayBuffer` per channel, so transferring
   * those copies never detaches `channelBuffers` itself — it stays reusable
   * across chunks without reallocating on every flush.
   */
  private flush() {
    if (this.filled === 0 || this.numChannels === 0) return
    const channels = this.channelBuffers.map((buf) => buf.slice(0, this.filled))
    const msg: OutMessage = { type: 'chunk', channels, frameCount: this.filled }
    this.port.postMessage(msg, channels.map((c) => c.buffer))
    this.filled = 0
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]
    if (!input || input.length === 0 || (input[0]?.length ?? 0) === 0) return true
    this.ensureBuffers(input.length)
    const n = input[0].length
    // A render quantum is 128 frames in every Chromium build this project
    // targets, but nothing in the spec guarantees that forever — flushing
    // early instead of trusting `CHUNK_FRAMES % n === 0` is what keeps this
    // safe if that ever changes, rather than writing past the buffer's end.
    if (this.filled + n > this.channelBuffers[0].length) this.flush()
    for (let c = 0; c < this.numChannels; c++) {
      const src = input[c]
      const dst = this.channelBuffers[c]
      for (let i = 0; i < n; i++) dst[this.filled + i] = src[i]
    }
    this.filled += n
    if (this.filled >= CHUNK_FRAMES) this.flush()
    return true
  }
}

registerProcessor('recorder-tap', RecorderTapProcessor)
