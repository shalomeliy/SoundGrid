import { describe, expect, it } from 'vitest'
import { AI_SAFE_ACTIONS, AI_TOOL_CATALOG, validateToolCall } from '@/core/ai/toolCatalog.ts'

describe('AI tool catalog completeness', () => {
  // Same pattern as tests/core/hints.test.ts's FLX4_MAPPING/FLX4_LABELS check:
  // two hand-authored lists that must agree, so a future action added to one
  // and forgotten in the other fails loudly instead of quietly making a
  // command unreachable from natural language.
  const catalogNames = new Set(AI_TOOL_CATALOG.map((t) => t.name))

  it('has a catalog entry for every action in AI_SAFE_ACTIONS', () => {
    for (const action of AI_SAFE_ACTIONS) {
      expect(catalogNames.has(action), `${action} is in AI_SAFE_ACTIONS but has no AI_TOOL_CATALOG entry`).toBe(
        true,
      )
    }
  })

  it('does not carry a real-action catalog entry with no matching AI_SAFE_ACTIONS entry', () => {
    const safe = new Set<string>(AI_SAFE_ACTIONS)
    for (const tool of AI_TOOL_CATALOG) {
      if (tool.name === 'clarify' || tool.name === 'decline') continue
      expect(safe.has(tool.name), `${tool.name} is in AI_TOOL_CATALOG but missing from AI_SAFE_ACTIONS`).toBe(true)
    }
  })

  it('always offers clarify and decline alongside the real actions', () => {
    expect(catalogNames.has('clarify')).toBe(true)
    expect(catalogNames.has('decline')).toBe(true)
  })
})

describe('validateToolCall', () => {
  it('accepts a well-formed call to a real action', () => {
    const result = validateToolCall({ name: 'play', args: { deck: 'A' } })
    expect(result.ok).toBe(true)
  })

  it('accepts a well-formed clarify call', () => {
    const result = validateToolCall({ name: 'clarify', args: { question: 'Which deck?' } })
    expect(result.ok).toBe(true)
  })

  it('accepts a well-formed decline call', () => {
    const result = validateToolCall({ name: 'decline', args: { reason: 'Vocal isolation is not built yet.' } })
    expect(result.ok).toBe(true)
  })

  it('rejects an unknown action name', () => {
    const result = validateToolCall({ name: 'isolateVocals', args: { deck: 'B' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('isolateVocals')
  })

  it('rejects a deck value outside the enum', () => {
    const result = validateToolCall({ name: 'play', args: { deck: 'C' } })
    expect(result.ok).toBe(false)
  })

  it('rejects a missing required field', () => {
    const result = validateToolCall({ name: 'loop', args: { deck: 'A' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('beats')
  })

  it('rejects a loop length outside the allowed steps', () => {
    const result = validateToolCall({ name: 'loop', args: { deck: 'A', beats: 3 } })
    expect(result.ok).toBe(false)
  })

  it('rejects a wrong-typed argument', () => {
    const result = validateToolCall({ name: 'setFilter', args: { deck: 'A', amount: 'up' } })
    expect(result.ok).toBe(false)
  })
})
