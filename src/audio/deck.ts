import { EQ_DB, EQ_HIGH_HZ, EQ_LOW_HZ, EQ_MID_HZ, tempoToRate } from './constants'
import type { DeckId } from '../types'

/**
 * One playback deck. Owns its Web Audio graph:
 *
 *   BufferSource -> trim -> eqLow -> eqMid -> eqHigh -> filter -> channelGain
 *        channelGain -> faderGain -> (master bus)
 *        channelGain -> cueGain   -> (cue bus)
 *
 * Position is derived from AudioContext.currentTime so it stays sample-accurate
 * regardless of the render-loop cadence.
 */
export class Deck {
  readonly id: DeckId
  private ctx: AudioContext

  private trim: GainNode
  private eqLow: BiquadFilterNode
  private eqMid: BiquadFilterNode
  private eqHigh: BiquadFilterNode
  private lpf: BiquadFilterNode
  private hpf: BiquadFilterNode
  private channelGain: GainNode
  readonly faderGain: GainNode
  readonly cueGain: GainNode

  private source: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null

  private _playing = false
  private startCtxTime = 0
  private startOffset = 0
  private _tempo = 0
  private _cueMonitor = false

  loopStart: number | null = null
  loopEnd: number | null = null

  onEnded?: () => void

  constructor(ctx: AudioContext, id: DeckId) {
    this.ctx = ctx
    this.id = id

    this.trim = ctx.createGain()
    this.eqLow = eqBand(ctx, 'lowshelf', EQ_LOW_HZ)
    this.eqMid = eqBand(ctx, 'peaking', EQ_MID_HZ)
    this.eqHigh = eqBand(ctx, 'highshelf', EQ_HIGH_HZ)
    this.lpf = ctx.createBiquadFilter()
    this.lpf.type = 'lowpass'
    this.lpf.frequency.value = 22050
    this.lpf.Q.value = 0.7
    this.hpf = ctx.createBiquadFilter()
    this.hpf.type = 'highpass'
    this.hpf.frequency.value = 20
    this.hpf.Q.value = 0.7
    this.channelGain = ctx.createGain()
    this.faderGain = ctx.createGain()
    this.cueGain = ctx.createGain()
    this.cueGain.gain.value = 0

    this.trim
      .connect(this.eqLow)
      .connect(this.eqMid)
      .connect(this.eqHigh)
      .connect(this.hpf)
      .connect(this.lpf)
      .connect(this.channelGain)
    this.channelGain.connect(this.faderGain)
    this.channelGain.connect(this.cueGain)
  }

  get playing() {
    return this._playing
  }

  get hasTrack() {
    return this.buffer !== null
  }

  get duration() {
    return this.buffer?.duration ?? 0
  }

  load(buffer: AudioBuffer) {
    this.stopSource()
    this.buffer = buffer
    this.startOffset = 0
    this._playing = false
    this.loopStart = this.loopEnd = null
  }

  unload() {
    this.stopSource()
    this.buffer = null
    this.startOffset = 0
    this._playing = false
  }

  get position(): number {
    if (!this.buffer) return 0
    if (!this._playing) return clamp(this.startOffset, 0, this.buffer.duration)
    const elapsed = (this.ctx.currentTime - this.startCtxTime) * this.rate
    let pos = this.startOffset + elapsed
    if (this.loopStart !== null && this.loopEnd !== null && pos >= this.loopEnd) {
      const span = this.loopEnd - this.loopStart
      pos = this.loopStart + ((pos - this.loopStart) % span)
    }
    return clamp(pos, 0, this.buffer.duration)
  }

  private get rate() {
    return tempoToRate(this._tempo)
  }

  play() {
    if (!this.buffer || this._playing) return
    this.startSource(this.position)
    this._playing = true
  }

  pause() {
    if (!this._playing) return
    this.startOffset = this.position
    this.stopSource()
    this._playing = false
  }

  togglePlay() {
    if (this._playing) this.pause()
    else this.play()
  }

  seek(sec: number) {
    const wasPlaying = this._playing
    this.stopSource()
    this.startOffset = clamp(sec, 0, this.duration)
    if (wasPlaying) this.startSource(this.startOffset)
  }

  /** Serato-style CUE: jump to cue point; hold-to-play handled by caller. */
  cueTo(sec: number) {
    this.seek(sec)
  }

  setTempo(tempo: number) {
    this._tempo = tempo
    if (this.source) {
      // keep position continuous across a rate change
      this.startOffset = this.position
      this.startCtxTime = this.ctx.currentTime
      this.source.playbackRate.setValueAtTime(this.rate, this.ctx.currentTime)
    }
  }

  setVolume(v: number) {
    this.channelGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  setEq(band: 'low' | 'mid' | 'high', knob: number) {
    const node = band === 'low' ? this.eqLow : band === 'mid' ? this.eqMid : this.eqHigh
    const db = knob >= 0 ? knob * EQ_DB : knob * 70 // full cut at -1
    node.gain.setTargetAtTime(db, this.ctx.currentTime, 0.01)
  }

  /** -1 => heavy HPF, 0 => bypass, +1 => heavy LPF */
  setFilter(knob: number) {
    const now = this.ctx.currentTime
    if (Math.abs(knob) < 0.02) {
      this.lpf.frequency.setTargetAtTime(22050, now, 0.02)
      this.hpf.frequency.setTargetAtTime(20, now, 0.02)
      return
    }
    if (knob > 0) {
      const f = expScale(1 - knob, 400, 22050)
      this.lpf.frequency.setTargetAtTime(f, now, 0.02)
      this.hpf.frequency.setTargetAtTime(20, now, 0.02)
    } else {
      const f = expScale(1 + knob, 40, 8000)
      this.hpf.frequency.setTargetAtTime(f, now, 0.02)
      this.lpf.frequency.setTargetAtTime(22050, now, 0.02)
    }
  }

  setCueMonitor(on: boolean) {
    this._cueMonitor = on
    this.cueGain.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.01)
  }

  get cueMonitor() {
    return this._cueMonitor
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

  private startSource(offset: number) {
    if (!this.buffer) return
    this.stopSource()
    const src = this.ctx.createBufferSource()
    src.buffer = this.buffer
    src.playbackRate.value = this.rate
    if (this.loopStart !== null && this.loopEnd !== null) {
      src.loop = true
      src.loopStart = this.loopStart
      src.loopEnd = this.loopEnd
    }
    src.connect(this.trim)
    src.onended = () => {
      if (this.source === src && this._playing) {
        this._playing = false
        this.startOffset = this.duration
        this.onEnded?.()
      }
    }
    src.start(0, offset)
    this.source = src
    this.startCtxTime = this.ctx.currentTime
    this.startOffset = offset
  }

  private stopSource() {
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

function eqBand(ctx: AudioContext, type: BiquadFilterType, freq: number) {
  const n = ctx.createBiquadFilter()
  n.type = type
  n.frequency.value = freq
  if (type === 'peaking') n.Q.value = 0.9
  n.gain.value = 0
  return n
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function expScale(t: number, min: number, max: number) {
  return min * Math.pow(max / min, clamp(t, 0, 1))
}
