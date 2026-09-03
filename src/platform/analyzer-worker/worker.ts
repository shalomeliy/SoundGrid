/**
 * Runs inside a dedicated Worker (constructed by `index.ts`). Only the
 * CPU-bound numeric work — `analyzeWaveform` + `detectBeatGrid` — happens
 * here. Decode and content hashing both stay on the main thread: this app's
 * target Chromium has neither `OfflineAudioContext` nor `AudioBuffer` inside
 * a Worker (verified empirically, see `workshop-output/PLAN.md`), and
 * `crypto.subtle.digest` is already async on the main thread, so there was
 * nothing to gain moving it here.
 *
 * `self` is typed via the DOM lib's `Worker` interface rather than the
 * `webworker` lib, on purpose: this repo's `tsconfig.app.json` has one `lib`
 * list for all of `src/`, and combining `DOM` with `webworker` in one
 * TypeScript program produces duplicate-global conflicts. `Worker`'s
 * `postMessage`/`onmessage` shape is exactly what this file needs, so it's a
 * safe, self-contained stand-in that avoids widening the project's lib set
 * for one file.
 */
import { analyzeTrack } from '@/platform/analyzer-js/analyze'
import type { AnalyzeRequest, AnalyzeResponse } from '@/platform/analyzer-worker/protocol'

declare const self: Worker

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const { id, pcm, opts } = e.data
  let response: AnalyzeResponse
  let transfer: Transferable[] = []
  try {
    const analysis = analyzeTrack(pcm, opts)
    response = { id, ok: true, analysis }
    // Zero-copy back to the main thread — these arrays were only ever built
    // for this response, nothing else in the worker still needs them.
    transfer = [analysis.peaks.buffer, analysis.bands.buffer]
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(response, transfer)
}
