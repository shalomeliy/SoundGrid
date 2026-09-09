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
 * `device: 'wasm'` — CPU only, WebGPU deliberately not attempted. It
 * started as `'auto'` (try the graphics chip, fall back to the processor —
 * Shalom's choice, 09/09), on the theory that ONNX Runtime Web's own
 * execution-provider fallback would degrade safely if WebGPU didn't work.
 * It doesn't: on Shalom's real hardware (Windows, 09/09) the WebGPU path
 * hung his actual GPU driver — `DXGI_ERROR_DEVICE_HUNG`, Chrome's console
 * showing the D3D12 device removed mid-inference, CPU sitting idle while
 * the UI stayed stuck on `thinking` forever (confirmed: Task Manager showed
 * no load, so this was a genuine hang, not "slow"). A hung GPU driver is
 * not a degradation this project's `Capabilities` pattern can catch and
 * show a message for — the call itself never returns, on the JS side or
 * off it — so there is no safe way to keep trying WebGPU here and catch
 * the failure after the fact. `wasm` is slower but has not hung anything.
 * Revisit only with a real measurement on real hardware that says
 * otherwise, not a driver update assumed to have fixed it.
 *
 * `MODEL_DTYPE` follows: `'q8'`, not the GPU-oriented `'q4f16'` this
 * started with — `@huggingface/transformers`' own
 * `DEFAULT_DEVICE_DTYPE_MAPPING` maps `wasm` to `q8` for exactly this
 * reason (fp16 arithmetic is a GPU feature; CPU/WASM doesn't get it for
 * free). Not this session's own guess.
 *
 * `MODEL_ID` is this project's swap point for "which model" (the port is
 * model-agnostic by design, `core/ports/ai.ts`) — taken from
 * `@huggingface/transformers`' own documented chat-completion example
 * (`node_modules/@huggingface/transformers/types/pipelines/text-generation.d.ts`).
 * Swap it here if a real run on real hardware says a different model fits
 * better — this is now the one path that has actually run on Shalom's
 * machine without hanging it, so change it deliberately, not by habit.
 */
import { pipeline, TextStreamer, type TextGenerationPipeline } from '@huggingface/transformers'
import { extractToolCall, toOpenAiTools } from '@/core/ai/toolCallParsing'
import type { AiWorkerReply, AiWorkerRequest } from '@/platform/ai-local/protocol'

declare const self: Worker

const MODEL_ID = 'onnx-community/Qwen3-0.6B-ONNX'
const MODEL_DEVICE = 'wasm'
const MODEL_DTYPE = 'q8'
const MAX_NEW_TOKENS = 128

let generatorPromise: Promise<TextGenerationPipeline> | null = null

function loadGenerator(onProgress: (pct: number) => void): Promise<TextGenerationPipeline> {
  if (!generatorPromise) {
    generatorPromise = pipeline('text-generation', MODEL_ID, {
      device: MODEL_DEVICE,
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
    // Qwen3's chat template defaults to "thinking" mode: a long <think>...</think>
    // reasoning trace before the actual answer, which is most of why a first
    // real run took ~60s even for a one-word command and, on a second run,
    // ran the full 120s watchdog out without ever reaching a tool call
    // (Shalom's machine, 09/09 — see HANDOFF.md). `enable_thinking: false` is
    // Qwen3's own documented chat-template flag for skipping that trace
    // entirely, passed through tokenizer_encode_kwargs exactly as the
    // pipeline's own docs describe for chat input. Not verified yet — the
    // next real run on his machine is what confirms this actually helps.
    tokenizer_encode_kwargs: { enable_thinking: false },
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
