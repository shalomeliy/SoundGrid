import { describe, expect, it } from 'vitest'
import { validateToolCall } from '@/core/ai/toolCatalog.ts'
import type { AIMessage, AIToolCall } from '@/core/ports/ai.ts'
import { AI_MOCK_CORPUS, mockAiProvider } from '@/platform/ai-mock/index.ts'

/**
 * v0.5.5's acceptance corpus (`workshop-output/FEATURE_SPEC.md`): every
 * phrase must translate to a real, valid action, or to an explicit
 * clarify/decline — never silently to nothing and never to a malformed
 * call. This exercises the mock provider + the validation gate together,
 * engine-free (no AudioContext, no store) — the same split CLAUDE.md
 * already draws between pure logic (real tests) and anything touching the
 * audio engine (browser-verified only, `controls.ts`'s `submitAiCommand`
 * itself is checked that way, not here).
 */
async function respond(phrase: string): Promise<AIToolCall> {
  const msgs: AIMessage[] = [{ role: 'user', content: phrase }]
  let call: AIToolCall | null = null
  for await (const chunk of mockAiProvider.chat(msgs)) {
    if (chunk.kind === 'toolCall') call = chunk.call
  }
  if (!call) throw new Error(`mockAiProvider produced no tool call for "${phrase}"`)
  return call
}

describe('v0.5.5 acceptance corpus', () => {
  for (const { phrase, call: expected } of AI_MOCK_CORPUS) {
    it(`translates "${phrase}" correctly`, async () => {
      const call = await respond(phrase)
      expect(call).toEqual(expected)
      const result = validateToolCall(call)
      expect(result.ok, !result.ok ? result.reason : '').toBe(true)
    })
  }

  it('asks for clarification on a phrase it does not recognise, instead of guessing', async () => {
    const call = await respond('תעשה משהו מגניב')
    expect(call.name).toBe('clarify')
    expect(validateToolCall(call).ok).toBe(true)
  })

  it('never produces a call that fails validation for a corpus phrase', async () => {
    for (const { phrase } of AI_MOCK_CORPUS) {
      const call = await respond(phrase)
      const result = validateToolCall(call)
      expect(result.ok, `"${phrase}" -> ${JSON.stringify(call)} failed: ${!result.ok ? result.reason : ''}`).toBe(
        true,
      )
    }
  })
})
