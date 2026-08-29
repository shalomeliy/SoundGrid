import type { ControlAction } from '@/core/mapping/mapping'

/**
 * An external control surface's *input* side. Web MIDI is the only transport
 * today; WebHID, Bluetooth MIDI, WebSerial, OSC and a phone-as-remote all fit
 * the same shape. Output (LED feedback) lands with v0.11.
 */
export type TransportStatus = 'unsupported' | 'idle' | 'requesting' | 'ready' | 'denied'

export interface TransportDevice {
  id: string
  name: string
  manufacturer: string
}

export interface ControlTransport {
  readonly id: string
  readonly status: TransportStatus
  connect(): Promise<void>
  disconnect(): void
  listDevices(): TransportDevice[]
  /** every decoded control gesture arrives here; `controls.ts` dispatches it */
  onAction(handler: (action: ControlAction, value: number) => void): () => void
}
