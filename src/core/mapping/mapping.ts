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

export interface MidiMapping {
  name: string
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

/** Relative encoder decode: two's-complement around 64 (rekordbox/Serato style). */
export function relativeDelta(value: number): number {
  return value < 64 ? value : value - 128
}
