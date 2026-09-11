/**
 * Wraps one `recorder-tap` `AudioWorkletNode` — one instance per active
 * recording. Two of these can run concurrently (a sampler-slot capture and
 * a master recording at once) because each owns its own node on the graph;
 * neither shares state with the other, which is the fix for the concurrent-
 * recording risk the QA review raised for v0.7.5.
 */
export interface RecorderChunk {
  channels: Float32Array[]
  frameCount: number
}

interface ChunkMessage {
  type: 'chunk'
  channels: Float32Array[]
  frameCount: number
}

export class RecorderTap {
  private node: AudioWorkletNode
  private stopped = false

  onChunk?: (chunk: RecorderChunk) => void

  /**
   * `source` is tapped, never disconnected from anything it already feeds —
   * a branch, not a chain (the spec's explicit requirement: a dead or
   * stopped tap must never affect the live monitored mix).
   */
  constructor(ctx: AudioContext, source: AudioNode, numberOfChannels: number) {
    this.node = new AudioWorkletNode(ctx, 'recorder-tap', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: numberOfChannels,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    })
    this.node.port.onmessage = (e: MessageEvent<ChunkMessage>) => {
      if (e.data.type === 'chunk') {
        this.onChunk?.({ channels: e.data.channels, frameCount: e.data.frameCount })
      }
    }
    source.connect(this.node)
  }

  /**
   * Asks the processor to hand over whatever it's holding, then tears the
   * connection down shortly after — long enough for one more render quantum
   * to deliver that final chunk before `onChunk` stops firing.
   */
  stop() {
    if (this.stopped) return
    this.stopped = true
    this.node.port.postMessage({ type: 'flush' })
    window.setTimeout(() => {
      this.node.disconnect()
      this.node.port.onmessage = null
    }, 50)
  }
}
