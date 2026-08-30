import { EQ_DB, EQ_HIGH_HZ, EQ_LOW_HZ, EQ_MID_HZ, tempoToRate } from '@/core/constants'
import { BufferSourcePlayer, WorkletPlayer, type SourcePlayer } from '@/platform/audio-webaudio/players'
import type { DeckId } from '@/core/types'

/** Turntable spin-down and spin-up times. Roughly a 1200's, which is the
 *  feel DJs expect; short enough that a stop still reads as deliberate. */
const BRAKE_SEC = 0.55
const SPIN_UP_SEC = 0.32

/** How long a pitch bend lingers after the last jog tick before easing back. */
const BEND_HOLD_MS = 90
/** And how long the ease back to grid speed takes. */
const BEND_RELEASE_SEC = 0.12

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
  // on by default, as every DJ deck ships; the store's initial state matches
  private _vinylMode = true
  private _scratching = false
  /** what play state to return to when the hand comes off the platter */
  private _resumePlaying = false
  private bendTimer = 0

  loopStart: number | null = null
  loopEnd: number | null = null

  onEnded?: () => void
  /** the scratch worklet died mid-render; the engine surfaces the reason */
  onProcessorError?: (reason: string) => void

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
      // Construct before disposing. Constructing an AudioWorkletNode can throw,
      // and disposing first would leave the deck holding a torn-down player
      // with no way back — a dead deck from a failure that was recoverable.
      const next = new WorkletPlayer(this.ctx, this.trim)
      const previous = this.player
      this.player = next
      previous.dispose()
      next.onEnd = () => this.handleEnd()
      next.onProcessorError = () =>
        this.onProcessorError?.('the scratch engine stopped on this deck')
      next.setRate(this.rate)
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
    if (this._playing) {
      if (this._vinylMode) this.brakeToStop()
      else this.pause()
    } else if (this._vinylMode) {
      this.spinUpToPlay()
    } else {
      this.play()
    }
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
    if (!this._scratching) this.player.setRate(this.rate)
  }

  get vinylMode() {
    return this._vinylMode
  }

  /** Vinyl mode makes stop/start spin down and up instead of cutting. */
  setVinylMode(on: boolean) {
    this._vinylMode = on
  }

  get scratching() {
    return this._scratching
  }

  /**
   * Hand the rate over to a hand on the platter.
   *
   * The deck keeps reporting `playing` throughout: a finger on a spinning
   * record has not paused the deck, and letting the transport flicker on every
   * touch would flash the UI and fight the render loop. What was playing is
   * remembered so the release knows whether to spin back up or stay held.
   */
  beginScratch() {
    if (!this._hasTrack || this._scratching) return
    this._scratching = true
    this._resumePlaying = this._playing
    if (!this._playing) {
      // a stopped deck still has to feed the pointer for a scratch to be heard
      this.player.setRate(0)
      this.player.start(this.position)
      this._playing = true
    }
    this.player.setRate(0)
  }

  /**
   * Temporary pitch bend — nudging a playing deck forward or back to line it up
   * without touching tempo. This is a *rate* change, not a seek: seeking moves
   * the playhead and would tear a beatgrid, while bending is what a hand on the
   * rim of a running turntable actually does. The bend decays back to grid
   * speed on its own, so the deck cannot be left running off-speed.
   */
  pitchBend(amount: number) {
    if (!this._playing || this._scratching) return
    const bent = this.rate * (1 + amount)
    this.player.setRate(bent)
    this.clearBendTimer()
    this.bendTimer = window.setTimeout(() => {
      this.bendTimer = 0
      if (this._scratching || !this._playing) return
      this.player.rampRate(this.rate, BEND_RELEASE_SEC)
    }, BEND_HOLD_MS)
  }

  /**
   * A bend held open until it is released, for a key or a button that has a
   * down and an up. `pitchBend` decays on a timer because a jog tick has no
   * end; a held key does, and letting the timer win under it would make the
   * bend expire while the finger is still down.
   */
  holdBend(amount: number) {
    if (!this._playing || this._scratching) return
    this.clearBendTimer()
    this.player.setRate(this.rate * (1 + amount))
  }

  /** Ease back to grid speed. Safe to call when no bend is open. */
  releaseBend() {
    this.clearBendTimer()
    if (this._scratching || !this._playing) return
    this.player.rampRate(this.rate, BEND_RELEASE_SEC)
  }

  private clearBendTimer() {
    if (this.bendTimer) {
      window.clearTimeout(this.bendTimer)
      this.bendTimer = 0
    }
  }

  /** Rate in playback multiples: 1 = normal forward, negative = backwards. */
  scratchRate(rate: number) {
    if (!this._scratching) return
    this.player.setRate(rate)
  }

  /**
   * Release the platter. In vinyl mode the record spins back up to speed over
   * `SPIN_UP_SEC` rather than snapping, which is what makes a release sound
   * like a turntable instead of an edit.
   */
  endScratch() {
    if (!this._scratching) return
    this._scratching = false
    if (this._resumePlaying) {
      if (this._vinylMode) this.player.rampRate(this.rate, SPIN_UP_SEC)
      else this.player.setRate(this.rate)
    } else {
      this.player.stop()
      this._playing = false
      this.player.setRate(this.rate)
    }
  }

  /**
   * Vinyl stop: spin down to a standstill, then park. The pause lands when the
   * platter has actually stopped, not when the command was issued — otherwise
   * the audio would cut mid-spin and the whole point is lost.
   */
  brakeToStop(seconds = BRAKE_SEC) {
    if (!this._playing) return
    this.player.rampRate(0, seconds)
    this._playing = false
    window.setTimeout(() => {
      // A play/seek during the spin-down wins: only park if nothing else has
      // taken the deck since.
      if (this._playing || this._scratching) return
      this.player.stop()
      this.player.setRate(this.rate)
    }, seconds * 1000)
  }

  /** Vinyl start: from a standstill up to speed. */
  spinUpToPlay(seconds = SPIN_UP_SEC) {
    if (!this._hasTrack || this._playing) return
    this.player.setRate(0)
    this.player.start(this.position)
    this._playing = true
    this.player.rampRate(this.rate, seconds)
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
