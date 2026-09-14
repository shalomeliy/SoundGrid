/**
 * `core/ports/embedder.ts`'s `Embedder`, backed by `meyda` in a Worker where
 * `capabilities.webWorker` allows it, falling back to the main thread
 * otherwise — same shape as `analyzer-worker/index.ts`.
 */
import { computeClassicalEmbedding } from '@/platform/embed-classical/analyze'
import { detectCapabilities } from '@/platform/capabilities'
import type { Embedder } from '@/core/ports/embedder'
import type { PcmData } from '@/core/ports/analyzer'
import type { EmbedRequest, EmbedResponse } from '@/platform/embed-classical/protocol'
// `?worker`, not `new Worker(new URL(...))` — see `analyzer-worker/index.ts`'s
// comment on the same line; `tests/repo/worker-import-syntax.test.ts` pins it
// across every worker in the app, this one included.
import EmbedClassicalWorkerCtor from '@/platform/embed-classical/worker.ts?worker'

export const CLASSICAL_MODEL_ID = 'meyda-mfcc-chroma-v1'

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, (response: EmbedResponse) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new EmbedClassicalWorkerCtor()
    worker.onmessage = (e: MessageEvent<EmbedResponse>) => {
      const resolve = pending.get(e.data.id)
      if (!resolve) return // already settled by onerror, or a stale response — ignore, don't throw
      pending.delete(e.data.id)
      resolve(e.data)
    }
    worker.onerror = (e: ErrorEvent) => {
      const message = e.message || 'worker error'
      for (const resolve of pending.values()) resolve({ id: -1, ok: false, error: message })
      pending.clear()
    }
  }
  return worker
}

function embedInWorker(pcm: PcmData): Promise<EmbedResponse> {
  const id = nextId++
  const w = getWorker()
  return new Promise((resolve) => {
    pending.set(id, resolve)
    const req: EmbedRequest = { id, pcm }
    // Transferred, not copied — same reasoning as `analyzer-worker/index.ts`.
    // Do not reuse `pcm` after calling this.
    const transfer = pcm.channels.map((c) => c.buffer)
    w.postMessage(req, transfer)
  })
}

export const classicalEmbedder: Embedder = {
  modelId: CLASSICAL_MODEL_ID,
  async embed(pcm: PcmData): Promise<Float32Array> {
    if (!detectCapabilities().webWorker) {
      return computeClassicalEmbedding(pcm)
    }
    const response = await embedInWorker(pcm)
    if (response.ok) return response.vector
    throw new Error(response.error)
  },
}
