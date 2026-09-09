import { describe, expect, it } from 'vitest'
import { AI_TOOL_CATALOG } from '@/core/ai/toolCatalog.ts'
import { extractToolCall, toOpenAiTools } from '@/core/ai/toolCallParsing.ts'

describe('toOpenAiTools', () => {
  it('wraps every catalog entry as a {type, function} pair, name/description/parameters intact', () => {
    const wrapped = toOpenAiTools(AI_TOOL_CATALOG)
    expect(wrapped).toHaveLength(AI_TOOL_CATALOG.length)
    for (const [i, tool] of AI_TOOL_CATALOG.entries()) {
      expect(wrapped[i]).toEqual({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      })
    }
  })

  it('returns an empty array for an empty catalog', () => {
    expect(toOpenAiTools([])).toEqual([])
  })
})

describe('extractToolCall', () => {
  it('parses a Qwen/Hermes-style <tool_call> tag', () => {
    const text = 'Sure, one moment.\n<tool_call>\n{"name": "play", "arguments": {"deck": "A"}}\n</tool_call>'
    expect(extractToolCall(text)).toEqual({ name: 'play', args: { deck: 'A' } })
  })

  it('parses a bare JSON object with no surrounding tag', () => {
    const text = '{"name": "pause", "arguments": {"deck": "B"}}'
    expect(extractToolCall(text)).toEqual({ name: 'pause', args: { deck: 'B' } })
  })

  it('accepts this port\'s own "args" key as well as "arguments"', () => {
    const text = '{"name": "syncDeck", "args": {"deck": "B"}}'
    expect(extractToolCall(text)).toEqual({ name: 'syncDeck', args: { deck: 'B' } })
  })

  it('defaults args to {} when the call takes no arguments and none were given', () => {
    expect(extractToolCall('{"name": "tapTempo"}')).toEqual({ name: 'tapTempo', args: {} })
  })

  it('handles a nested object value inside the arguments without stopping at the inner brace', () => {
    const text = '{"name": "clarify", "arguments": {"question": "which deck?", "meta": {"turn": 1}}}'
    expect(extractToolCall(text)).toEqual({
      name: 'clarify',
      args: { question: 'which deck?', meta: { turn: 1 } },
    })
  })

  it('returns null for plain prose with no JSON in it', () => {
    expect(extractToolCall("I'm not sure what you mean.")).toBeNull()
  })

  it('returns null for malformed JSON rather than throwing', () => {
    expect(extractToolCall('<tool_call>{"name": "play", oops}</tool_call>')).toBeNull()
  })

  it('returns null when the object has no string "name"', () => {
    expect(extractToolCall('{"arguments": {"deck": "A"}}')).toBeNull()
  })
})
