/**
 * Stub for v0.5.5 and beyond. Three rules fixed now so later versions cannot
 * quietly break them: AI is **optional** (the app is fully usable with no
 * provider), **model-agnostic** (local WebGPU/WASM, BYO-key, or self-hosted all
 * satisfy this), and it reaches the app only by emitting `ControlAction`s
 * through `controls.ts` — it never touches the audio graph or the store.
 */
import type { ControlAction } from '@/core/mapping/mapping'

export interface AISuggestion {
  action: ControlAction
  value: number
  /** why, in one line — shown to the user before anything is applied */
  reason: string
  confidence: number
}

export interface AIProvider {
  readonly id: string
  readonly available: boolean
  suggest(prompt: string, context: unknown): Promise<AISuggestion[]>
}
