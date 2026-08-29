/**
 * What this machine can actually do, resolved once at boot.
 *
 * The rule this exists to enforce: **no feature crashes when a capability is
 * missing.** It hides itself or degrades — no `setSinkId` means telling the user
 * to pick the card as the system default rather than throwing; no WebGPU means
 * stems stay offline-only.
 */
export interface Capabilities {
  /** AudioWorklet → heavy DSP, key-lock */
  audioWorklet: boolean
  /** real-time stems, WebGL waveforms */
  webgpu: boolean
  /** MIDI controllers */
  webmidi: boolean
  /** controllers that enumerate as HID */
  webhid: boolean
  /** a local library folder */
  fsAccess: boolean
  /** routing output to a specific card */
  setSinkId: boolean
  /** threads for DSP and analysis */
  sharedArrayBuffer: boolean
  /** waveform rendering off the main thread */
  offscreenCanvas: boolean
}
