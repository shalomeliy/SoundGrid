/**
 * Pure text <-> tool-call plumbing for `platform/ai-local/` (v0.5.5 phase 2) —
 * kept here, not in `platform/`, so it is testable without a model, a
 * Worker, or WebGPU (same split as `toolCatalog.ts`'s own doc comment:
 * `controls.ts` owns the engine/store side, `core/` owns the shape).
 *
 * `toOpenAiTools` converts our `AIToolDef` (this project's own vocabulary,
 * see `toolCatalog.ts`) into the `{type:'function', function:{...}}` shape
 * that chat-template `tools` blocks expect — this is the convention the
 * Hugging Face `transformers` ecosystem's default tool-use Jinja template
 * uses across model families (Qwen, Llama 3, Mistral), and the one
 * `@huggingface/transformers`' own `tools` generate-kwarg passes straight
 * into the model's chat template unchanged (it does not itself impose or
 * validate a schema — the loaded model's own template decides how `tools`
 * gets rendered into the prompt).
 *
 * `extractToolCall` goes the other way: a small instruct model asked to
 * "call a tool" does not hand back a structured object here (unlike the
 * Python `transformers` pipeline, `@huggingface/transformers` returns the
 * raw generated text) — it emits text that follows its own template's
 * convention for representing a call. Qwen-family models wrap it in
 * `<tool_call>...</tool_call>` (the Hermes/Qwen convention); others emit a
 * bare JSON object. This has never run against a real downloaded model in
 * this session — the container's network policy blocks the model host
 * (see `HANDOFF.md`) — so treat the exact tags/shape handled here as a
 * documented best guess to refine once that becomes possible, not a
 * measured fact. `validateToolCall` (`toolCatalog.ts`) is the real safety
 * net regardless: anything this misparses just fails validation and is
 * rejected with a reason, same as a wrong answer from any other provider.
 */
import type { AIToolCall, AIToolDef } from '@/core/ports/ai'

export interface OpenAiToolFunction {
  type: 'function'
  function: { name: string; description: string; parameters: AIToolDef['parameters'] }
}

export function toOpenAiTools(tools: AIToolDef[]): OpenAiToolFunction[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

/** Finds the first balanced `{...}` substring starting at `from` — simpler than a regex, and correct for nested braces (an arg value that is itself an object). */
function firstBalancedObject(text: string, from: number): string | null {
  const start = text.indexOf('{', from)
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** Accepts `{name, arguments}` (the OpenAI/HF convention the model was prompted with) as well as this port's own `{name, args}`, so a model that echoes either shape back still parses. */
function toToolCall(parsed: unknown): AIToolCall | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>
  if (typeof obj.name !== 'string') return null
  const args = 'arguments' in obj ? obj.arguments : 'args' in obj ? obj.args : {}
  return { name: obj.name, args }
}

/**
 * Best-effort extraction of one tool call out of a model's raw text
 * response. Tries, in order: a `<tool_call>` tag (Qwen/Hermes), then the
 * first balanced JSON object anywhere in the text. Returns `null` — never
 * throws — when nothing parses, so a chatty or malformed response degrades
 * to "the AI did not return an action" (the existing `submitAiCommand`
 * path), not a crash.
 */
export function extractToolCall(rawText: string): AIToolCall | null {
  const tagMatch = /<tool_call>([\s\S]*?)<\/tool_call>/.exec(rawText)
  const candidate = tagMatch ? tagMatch[1] : firstBalancedObject(rawText, 0)
  if (!candidate) return null
  try {
    return toToolCall(JSON.parse(candidate.trim()))
  } catch {
    return null
  }
}
