import type { Capabilities } from '@/core/ports'

/**
 * Resolved once at boot. Every probe is a feature test, never a user-agent
 * sniff — Chromium ships these at different versions across desktop and the
 * upcoming Tauri build, and the answer has to be about this machine.
 */
export function detectCapabilities(): Capabilities {
  const nav = navigator as Navigator & {
    requestMIDIAccess?: unknown
    hid?: unknown
    gpu?: unknown
  }
  return {
    audioWorklet: typeof AudioWorkletNode !== 'undefined',
    webgpu: 'gpu' in nav && nav.gpu != null,
    webmidi: typeof nav.requestMIDIAccess === 'function',
    webhid: 'hid' in nav && nav.hid != null,
    fsAccess: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
    // AudioContext.setSinkId is the one that matters (routing the mix to a
    // specific card); the HTMLMediaElement method of the same name is not it.
    setSinkId: typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
  }
}
