/**
 * Ambient types for `AudioWorkletGlobalScope`.
 *
 * `tsconfig.app.json` loads the DOM lib, and the DOM lib does not declare the
 * worklet scope — `AudioWorkletProcessor`, `registerProcessor` and the global
 * `sampleRate`/`currentTime` exist only inside a worklet. Without this file
 * `npm run check` fails on the processor, and the tempting fix (a second tsconfig
 * project for one file) is more machinery than the problem is worth.
 */

interface AudioWorkletProcessorLike {
  readonly port: MessagePort
}

declare const AudioWorkletProcessor: {
  prototype: AudioWorkletProcessorLike
  new (options?: AudioWorkletNodeOptions): AudioWorkletProcessorLike
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessorLike,
): void

/** Sample rate of the AudioContext this worklet is rendering for. */
declare const sampleRate: number

/** Context time, in seconds, of the first sample of the current render quantum. */
declare const currentTime: number
