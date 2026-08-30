import type { DeckId } from '@/core/types'

export type MidiMsgType = 'note' | 'cc'

export type ControlAction =
  | 'play'
  | 'cue'
  | 'sync'
  | 'load'
  | 'tempo'
  | 'jog'
  | 'jogTouch'
  | 'hotcue'
  | 'loopToggle'
  | 'loopHalve'
  | 'loopDouble'
  | 'channelVolume'
  | 'crossfader'
  | 'eqLow'
  | 'eqMid'
  | 'eqHigh'
  | 'filter'
  | 'masterVolume'
  | 'cueVolume'
  | 'cueMix'
  | 'cueMonitor'
  | 'browse'
  | 'browseEnter'

export interface Binding {
  action: ControlAction
  deck?: DeckId
  /** hot-cue index, etc. */
  param?: number
  /** button = note/gate, absolute = 0..127 knob/fader, relative = jog/encoder */
  mode: 'button' | 'absolute' | 'relative'
  /** invert an absolute control */
  invert?: boolean
}

/**
 * How a controller encodes a relative (endless-encoder) turn into one 7-bit byte.
 * There is no standard, so this is a property of the hardware and belongs to the
 * mapping — not a constant every controller has to happen to agree with.
 *
 * - `twos-complement` — 1..63 is +1..+63, 127..65 is -1..-63. What Serato and
 *   rekordbox presets usually document.
 * - `offset-64` — 64 is "no movement", 65 is +1, 63 is -1. What the DDJ-FLX4
 *   actually sends; see the note on FLX4_MAPPING.
 */
export type RelativeEncoding = 'twos-complement' | 'offset-64'

export interface MidiMapping {
  name: string
  /**
   * Defaults to `twos-complement` when a mapping does not say. A controller whose
   * scheme has not been measured gets the documented convention rather than a
   * silent guess at the other one.
   */
  relativeEncoding?: RelativeEncoding
  /** key: `${type}:${channel}:${data1}` */
  bindings: Record<string, Binding>
}

export function bindingKey(type: MidiMsgType, channel: number, data1: number) {
  return `${type}:${channel}:${data1}`
}

export function parseMessage(data: Uint8Array): {
  type: MidiMsgType
  channel: number
  data1: number
  data2: number
} | null {
  const status = data[0] & 0xf0
  const channel = data[0] & 0x0f
  if (status === 0x90 || status === 0x80) {
    return {
      type: 'note',
      channel,
      data1: data[1],
      // note-off, or note-on with velocity 0
      data2: status === 0x80 ? 0 : data[2],
    }
  }
  if (status === 0xb0) {
    return { type: 'cc', channel, data1: data[1], data2: data[2] }
  }
  return null
}

/**
 * Decode one relative-encoder byte into a signed tick count.
 *
 * The FLX4 measurement that forced this to become a parameter: turning either
 * jog wheel slowly produced `|delta| = 63` on **every single message** —
 * 2394/38, 3465/55 and 4725/75 ticks are all exactly 63 per message. A slow turn
 * cannot produce the maximum magnitude every time; the raw bytes were 63 and 65,
 * one either side of 64. Read as two's-complement that is ±63 per tick, so every
 * tick was amplified 63x **and inverted** — forward (65) came through as -63.
 * Nothing about it looked broken from the code, which is why it needed hardware.
 */
export function relativeDelta(value: number, encoding: RelativeEncoding = 'twos-complement'): number {
  return encoding === 'offset-64' ? value - 64 : value < 64 ? value : value - 128
}
