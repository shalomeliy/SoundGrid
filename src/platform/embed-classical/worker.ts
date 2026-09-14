/**
 * Runs inside a dedicated Worker, separate from `analyzer-worker`'s (v0.8.5
 * — `workshop-output/PLAN.md` §3): `meyda` is its own module with its own
 * cost to parse/init, and this Worker's job (embedding, batched over the
 * whole library) is a different load shape than the analyzer's per-track
 * BPM/waveform work — sharing one Worker would serialize the two behind a
 * single queue for no benefit.
 *
 * Same `self`-typed-as-`Worker` reasoning as `analyzer-worker/worker.ts`.
 */
import { computeClassicalEmbedding } from '@/platform/embed-classical/analyze'
import type { EmbedRequest, EmbedResponse } from '@/platform/embed-classical/protocol'

declare const self: Worker

self.onmessage = async (e: MessageEvent<EmbedRequest>) => {
  const { id, pcm } = e.data
  let response: EmbedResponse
  let transfer: Transferable[] = []
  try {
    const vector = await computeClassicalEmbedding(pcm)
    response = { id, ok: true, vector }
    transfer = [vector.buffer]
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(response, transfer)
}
