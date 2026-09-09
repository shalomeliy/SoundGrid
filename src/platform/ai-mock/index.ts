/**
 * Deterministic `AIProvider` for v0.5.5 phase 1 — proves the whole pipeline
 * (catalog -> validation -> confirm/clarify/decline -> `controls.ts`)
 * without any WebGPU/WASM model, so it runs anywhere `npm run dev` does,
 * including this remote container. `platform/ai-local/` (phase 2) replaces
 * this as the app's default provider later; this one stays in the tree for
 * tests and local development.
 *
 * Matching is exact-phrase, not fuzzy NLU — it is not trying to simulate
 * model quality, only to exercise every state the real pipeline has to
 * handle: a well-formed action, an unclear request, and a request for a
 * capability the app does not have.
 */
import type { AIChatChunk, AIMessage, AIProvider, AISuggestion, AIToolCall } from '@/core/ports/ai'

interface KnownCommand {
  phrase: string
  call: AIToolCall
}

/**
 * The v0.5.5 acceptance corpus (`workshop-output/FEATURE_SPEC.md`'s 10
 * commands + the "acapella" decline case + one genuinely ambiguous
 * clarify case) — every phrase here maps to a real, existing
 * `controls.ts` function through `AI_SAFE_ACTIONS`
 * (`core/ai/toolCatalog.ts`), except the acapella one, which is exactly
 * the request the app must decline rather than guess at.
 */
export const AI_MOCK_CORPUS: KnownCommand[] = [
  { phrase: 'נגן דק A', call: { name: 'play', args: { deck: 'A' } } },
  { phrase: 'עצור דק B', call: { name: 'pause', args: { deck: 'B' } } },
  { phrase: 'לופ 8 תיבות על דק A', call: { name: 'loop', args: { deck: 'A', beats: 8 } } },
  { phrase: 'קפוץ לקיו 2 בדק B', call: { name: 'jumpToHotCue', args: { deck: 'B', index: 1 } } },
  { phrase: 'עשה סנכרון לדק B', call: { name: 'syncDeck', args: { deck: 'B' } } },
  { phrase: 'טאפ טמפו על דק A', call: { name: 'tapTempo', args: { deck: 'A' } } },
  { phrase: 'תעלה טמפו דק A', call: { name: 'setTempo', args: { deck: 'A', amount: 0.15 } } },
  { phrase: 'תוריד את הפילטר על דק A', call: { name: 'setFilter', args: { deck: 'A', amount: -0.7 } } },
  { phrase: 'קרוספיידר לגמרי לדק B', call: { name: 'setCrossfader', args: { position: 1 } } },
  { phrase: 'תוריד את הווליום של דק B לאמצע', call: { name: 'setChannelVolume', args: { deck: 'B', level: 0.5 } } },
  { phrase: 'תעלה בס על דק B', call: { name: 'setEq', args: { deck: 'B', band: 'low', amount: 0.6 } } },
  {
    phrase: 'תכניס אקפלה מדק B',
    call: { name: 'decline', args: { reason: 'הפרדת ווקאל (אקפלה) עוד לא קיימת — מתוכננת לגרסה v0.20.' } },
  },
  { phrase: 'תעשה לופ', call: { name: 'clarify', args: { question: 'על איזה דק — A או B?' } } },
]

const FALLBACK_CLARIFY: AIToolCall = { name: 'clarify', args: { question: 'לא הבנתי — אפשר לנסח אחרת?' } }

function respondTo(text: string): AIToolCall {
  const trimmed = text.trim()
  const known = AI_MOCK_CORPUS.find((k) => k.phrase === trimmed)
  return known ? known.call : FALLBACK_CLARIFY
}

async function* chatImpl(msgs: AIMessage[]): AsyncGenerator<AIChatChunk> {
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
  yield { kind: 'toolCall', call: respondTo(lastUser?.content ?? '') }
  yield { kind: 'done' }
}

export const mockAiProvider: AIProvider = {
  id: 'mock',
  kind: 'local',
  available: true,
  capabilities: ['chat'],
  async suggest(): Promise<AISuggestion[]> {
    return []
  },
  chat(msgs: AIMessage[]) {
    return chatImpl(msgs)
  },
}
