import { Deck } from '@/platform/audio-webaudio/deck'
import type { DeckId } from '@/core/types'

interface AudioContextWithSink extends AudioContext {
  setSinkId?: (id: string | { type: 'none' }) => Promise<void>
  sinkId?: string
}

/**
 * Global audio engine. Builds a 4-channel output bus so a DJ controller's
 * built-in interface can carry master on 1/2 and headphone cue on 3/4 — the
 * same split Serato uses. Falls back to a stereo master + software-monitored
 * cue when the output device only exposes 2 channels.
 */
export class AudioEngine {
  ctx: AudioContextWithSink
  decks: Record<DeckId, Deck>

  private masterBus: GainNode
  private cueBus: GainNode
  private merger: ChannelMergerNode | null = null
  private stereoSum: GainNode | null = null
  private cueMix = 0
  private multichannel = false

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' }) as AudioContextWithSink
    this.masterBus = this.ctx.createGain()
    this.cueBus = this.ctx.createGain()
    this.decks = {
      A: new Deck(this.ctx, 'A'),
      B: new Deck(this.ctx, 'B'),
    }
    this.decks.A.faderGain.connect(this.masterBus)
    this.decks.B.faderGain.connect(this.masterBus)
    this.decks.A.cueGain.connect(this.cueBus)
    this.decks.B.cueGain.connect(this.cueBus)
    this.wireOutput()
  }

  private wireOutput() {
    this.merger?.disconnect()
    this.stereoSum?.disconnect()
    this.masterBus.disconnect()
    this.cueBus.disconnect()

    const maxCh = this.ctx.destination.maxChannelCount
    this.multichannel = maxCh >= 4

    if (this.multichannel) {
      this.ctx.destination.channelCount = 4
      this.ctx.destination.channelCountMode = 'explicit'
      this.ctx.destination.channelInterpretation = 'discrete'
      const merger = this.ctx.createChannelMerger(4)
      const splitM = this.ctx.createChannelSplitter(2)
      const splitC = this.ctx.createChannelSplitter(2)
      this.masterBus.connect(splitM)
      this.cueBus.connect(splitC)
      splitM.connect(merger, 0, 0)
      splitM.connect(merger, 1, 1)
      splitC.connect(merger, 0, 2)
      splitC.connect(merger, 1, 3)
      merger.connect(this.ctx.destination)
      this.merger = merger
    } else {
      // Stereo device: fold cue into master so the user still hears a preview.
      const sum = this.ctx.createGain()
      this.masterBus.connect(sum)
      this.cueBus.connect(sum)
      sum.connect(this.ctx.destination)
      this.stereoSum = sum
      this.applyCueMix()
    }
  }

  get isMultichannel() {
    return this.multichannel
  }

  /** The time authority every Clock consumer ultimately reads. */
  get currentTime() {
    return this.ctx.currentTime
  }

  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume()
  }

  async listOutputs(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    // Labels require a prior getUserMedia grant in most browsers.
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
    } catch {
      /* user declined; we'll still return devices with blank labels */
    }
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'audiooutput')
  }

  async setOutputDevice(deviceId: string): Promise<'ok' | 'unsupported' | 'error'> {
    if (typeof this.ctx.setSinkId !== 'function') return 'unsupported'
    try {
      await this.ctx.setSinkId(deviceId)
      this.wireOutput()
      return 'ok'
    } catch (err) {
      console.error('setSinkId failed', err)
      return 'error'
    }
  }

  setMasterVolume(v: number) {
    this.masterBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  setCueVolume(v: number) {
    this.cueBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  /** 0 = cue only in the phones, 1 = master only. Only meaningful in stereo-fold mode. */
  setCueMix(v: number) {
    this.cueMix = v
    this.applyCueMix()
  }

  private applyCueMix() {
    if (this.multichannel) return
    const now = this.ctx.currentTime
    this.masterBus.gain.setTargetAtTime(0.15 + 0.85 * this.cueMix, now, 0.01)
    this.cueBus.gain.setTargetAtTime(1 - this.cueMix, now, 0.01)
  }

  /** Equal-power crossfader. -1 => A only, +1 => B only. */
  setCrossfader(x: number) {
    const t = (x + 1) / 2
    const a = Math.cos((t * Math.PI) / 2)
    const b = Math.cos(((1 - t) * Math.PI) / 2)
    const now = this.ctx.currentTime
    this.decks.A.faderGain.gain.setTargetAtTime(a, now, 0.005)
    this.decks.B.faderGain.gain.setTargetAtTime(b, now, 0.005)
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return await this.ctx.decodeAudioData(data)
  }
}

export const engine = new AudioEngine()
