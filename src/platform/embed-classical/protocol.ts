/** Request/response shape for `embed-classical/worker.ts` — mirrors `analyzer-worker/protocol.ts`. */
import type { PcmData } from '@/core/ports/analyzer'

export interface EmbedRequest {
  id: number
  pcm: PcmData
}

export type EmbedResponse = { id: number; ok: true; vector: Float32Array } | { id: number; ok: false; error: string }
