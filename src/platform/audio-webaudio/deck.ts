import { EQ_DB, EQ_HIGH_HZ, EQ_LOW_HZ, EQ_MID_HZ, tempoToRate } from '@/core/constants'
import { BufferSourcePlayer, WorkletPlayer, type SourcePlayer } from '@/platform/audio-webaudio/players'
import type { DeckId } from '@/core/types'

/**
 * One playback deck. Owns its Web Audio graph:
 *
 *   player -> trim -> eqLow -> eqMid -> eqHigh -> filter -> channelGain
 *        channelGain -> faderGain -> (master bus)
 *        channelGain -> cueGain   -> (cue bus)
 *
 * Everything from `trim` onwards is fixed. The head of the chain is swappable:
 * a `WorkletPlayer` when the scratch worklet loaded, a `BufferSourcePlayer`
 * when it did not. Position stays sample-accurate either way, so it never
 * depends on the render loop's cadence.
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

  private player: SourcePlayer
  /** set by the engine once `addModule` has resolved; null means no scratch */
  private workletAvailable = false

  private _playing = false
  private _hasTrack = false
  private _durationSec = 0
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

    this.player = new BufferSourcePlayer(ctx, this.trim)
    this.player.onEnd = () => this.handleEnd()
  }

  /**
   * Called by the engine after the worklet module resolves. The swap itself is
   * deferred to the next `load`: a worklet player is handed the samples on
   * load, so upgrading a deck that already holds a track would need a re-decode.
   */
  enableWorklet() {
    this.workletAvailable = true
  }

  get canScratch() {
    return this.player.canScratch
  }

  private handleEnd() {
    this._playing = false
    this.onEnded?.()
  }

  get playing() {
    return this._playing
  }

  get hasTrack() {
    return this._hasTrack
  }

  get duration() {
    return this._durationSec
  }

  load(buffer: AudioBuffer) {
    if (this.workletAvailable && this.player.kind !== 'worklet') {
      this.player.dispose()
      this.player = new WorkletPlayer(this.ctx, this.trim)
      this.player.onEnd = () => this.handleEnd()
      this.player.setRate(this.rate)
    }
    this.player.load(buffer)
    // Duration and "is a track loaded" are captured as plain values rather than
    // asked of the buffer each time. The worklet player takes ownership of the
    // samples, so an AudioBuffer that has been handed over goes on answering
    // `!== null` and reporting a duration long after its bytes are gone. These
    // two fields are the deck's own truth.
    this._durationSec = buffer.duration
    this._hasTrack = true
    this._playing = false
    this.loopStart = this.loopEnd = null
  }

  unload() {
    this.player.unload()
    this._durationSec = 0
    this._hasTrack = false
    this._playing = false
  }

  get position(): number {
    if (!this._hasTrack) return 0
    return clamp(this.player.positionSec, 0, this._durationSec)
  }

  private get rate() {
    return tempoToRate(this._tempo)
  }

  play() {
    if (!this._hasTrack || this._playing) return
    this.player.start(this.position)
    this._playing = true
  }

  pause() {
    if (!this._playing) return
    this.player.stop()
    this._playing = false
  }

  togglePlay() {
    if (this._playing) this.pause()
    else this.play()
  }

  seek(sec: number) {
    this.player.seek(clamp(sec, 0, this.duration))
  }

  /** Serato-style CUE: jump to cue point; hold-to-play handled by caller. */
  cueTo(sec: number) {
    this.seek(sec)
  }

  setTempo(tempo: number) {
    this._tempo = tempo
    this.player.setRate(this.rate)
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
    this.player.setLoop(startSec, endSec)
  }

  clearLoop() {
    this.loopStart = this.loopEnd = null
    this.player.clearLoop()
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
