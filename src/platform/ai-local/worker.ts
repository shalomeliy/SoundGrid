/**
 * Runs inside the dedicated Worker `index.ts` owns — same reason as
 * `analyzer-worker/worker.ts`: this is the only place the actual model
 * (`@huggingface/transformers`, a multi-megabyte dependency) is imported,
 * so it never enters the main app bundle unless the AI feature is turned
 * on and a `Worker` is actually constructed.
 *
 * `self` typed as plain `Worker`, not the `webworker` lib — same
 * `tsconfig.app.json` conflict `analyzer-worker/worker.ts`'s own comment
 * explains.
 *
 * `device: 'auto'` is the whole answer to "try the graphics chip, fall
 * back to the processor" (Shalom's choice, 09/09): ONNX Runtime Web's own
 * execution-provider list tries WebGPU first and falls back to WASM if a
 * WebGPU session fails to create — this is more reliable than a static
 * `navigator.gpu` capability check done ahead of time, because a probe can
 * report an adapter that turns out to be a software (non-accelerated)
 * fallback, as this container's own `SwiftShader` adapter does (see
 * `HANDOFF.md`) — letting the real session creation decide, once, beats
 * duplicating that judgment here.
 *
 * `MODEL_ID`/`MODEL_DTYPE` are this project's one swap point for "which
 * model" (the port is model-agnostic by design, `core/ports/ai.ts`) — taken
 * from `@huggingface/transformers`' own documented chat-completion example
 * (`node_modules/@huggingface/transformers/types/pipelines/text-generation.d.ts`),
 * not a value this session could verify by actually downloading it: the
 * container's network policy blocks `huggingface.co` (see `HANDOFF.md`).
 * Swap both here if a real run on real hardware says a different model or
 * quantization fits better.
 */
import { pipeline, TextStreamer, type TextGenerationPipeline } from '@huggingface/transformers'
import { extractToolCall, toOpenAiTools } from '@/core/ai/toolCallParsing'
import type { AiWorkerReply, AiWorkerRequest } from '@/platform/ai-local/protocol'

declare const self: Worker

const MODEL_ID = 'onnx-community/Qwen3-0.6B-ONNX'
const MODEL_DTYPE = 'q4f16'
const MAX_NEW_TOKENS = 128

let generatorPromise: Promise<TextGenerationPipeline> | null = null

function loadGenerator(onProgress: (pct: number) => void): Promise<TextGenerationPipeline> {
  if (!generatorPromise) {
    generatorPromise = pipeline('text-generation', MODEL_ID, {
      device: 'auto',
      dtype: MODEL_DTYPE,
      progress_callback: (info: { status: string; progress?: number }) => {
        if (info.status === 'progress_total' && typeof info.progress === 'number') onProgress(info.progress)
      },
    }).catch((err: unknown) => {
      // A failed load must not leave the next call retrying a broken promise
      // forever — `submitAiCommand`'s own retry (typing another command) gets
      // a fresh attempt instead of the same rejection every time.
      generatorPromise = null
      throw err
    })
  }
  return generatorPromise
}

async function handleLoad(id: number) {
  await loadGenerator((pct) => reply({ id, kind: 'progress', pct }))
  reply({ id, kind: 'done' })
}

async function handleChat(id: number, req: Extract<AiWorkerRequest, { kind: 'chat' }>) {
  const generator = await loadGenerator((pct) => reply({ id, kind: 'progress', pct }))
  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (delta: string) => reply({ id, kind: 'text', delta }),
  })
  const output = await generator(req.msgs, {
    max_new_tokens: MAX_NEW_TOKENS,
    do_sample: false,
    tools: toOpenAiTools(req.tools),
    streamer,
  })
  // `generated_text` is the full chat including the reply we just streamed —
  // the model's own text, in whatever tag/JSON convention its chat template
  // uses for a call (see `toolCallParsing.ts`'s doc comment). Not a
  // structured tool_calls field: `@huggingface/transformers` (unlike the
  // Python `transformers` pipeline) returns raw text here.
  const chat = output[0].generated_text
  const lastTurn = Array.isArray(chat) ? chat.at(-1) : null
  const rawText = lastTurn && typeof lastTurn === 'object' && 'content' in lastTurn ? String(lastTurn.content) : ''
  const call = extractToolCall(rawText)
  if (call) reply({ id, kind: 'toolCall', call })
  reply({ id, kind: 'done' })
}

function reply(msg: AiWorkerReply) {
  self.postMessage(msg)
}

self.onmessage = (e: MessageEvent<AiWorkerRequest>) => {
  const req = e.data
  const task = req.kind === 'load' ? handleLoad(req.id) : handleChat(req.id, req)
  task.catch((err: unknown) => {
    reply({ id: req.id, kind: 'error', error: err instanceof Error ? err.message : String(err) })
  })
}
