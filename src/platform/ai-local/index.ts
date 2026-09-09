/**
 * `core/ports/ai.ts`'s `AIProvider`, backed by a real model running in a
 * Worker via `@huggingface/transformers` — v0.5.5 phase 2, replacing
 * `platform/ai-mock/` as `controls.ts`'s `activeAiProvider` (the mock stays
 * in the tree for tests, see its own doc comment).
 *
 * Same Worker/pending-map/`onerror`-rejects-all shape as
 * `analyzer-worker/index.ts`, widened from a single resolved value per
 * request to a small async channel (`makeChannel`) because both `load()`
 * and `chat()` are inherently streams of replies to one request, not one
 * request/response pair.
 *
 * **Not verified against a real model in this session** — the container's
 * network policy blocks `huggingface.co` (the model host), so `load()` has
 * only ever been exercised here as far as the request leaving the Worker;
 * whether the download and the model's own tool-call convention actually
 * work is what a real machine (real internet, and — per `worker.ts`'s
 * `device: 'auto'` comment — maybe a real GPU) has to confirm. Until then
 * this is verified in the type checker and in a Worker actually starting
 * and hitting a real, visible `model-error` for the actual reason (network
 * denied) rather than hanging or crashing the rest of the app.
 */
import { detectCapabilities } from '@/platform/capabilities'
import type { AIChatChunk, AIMessage, AIProvider, AISuggestion, AIToolDef } from '@/core/ports/ai'
import type { AiWorkerReply, AiWorkerRequest } from '@/platform/ai-local/protocol'
// The `?worker` suffix, not `new Worker(new URL(...))`, is what actually
// gets a module Worker bundled in Vite 8 — the latter only triggers
// generic `new URL(literal, import.meta.url)` asset copying (the raw,
// untranspiled `.ts` source, imports left unresolved), which parses fine
// in `npm run dev` (Vite serves and transpiles it on request) and fails
// silently in a real `vite build` output (`worker.onerror` fires with a
// bare "worker error", not the real cause). Found while building this
// provider and verifying it against `vite build`, not `npm run dev` — see
// `HANDOFF.md`. `analyzer-worker/index.ts` had the exact same bug; fixed
// in the same commit, `tests/repo/worker-import-syntax.test.ts` now pins it.
import AiWorkerCtor from '@/platform/ai-local/worker.ts?worker'

interface Channel<T> extends AsyncIterable<T> {
  push(item: T): void
  close(): void
  fail(err: unknown): void
}

/** A minimal async push-queue: `worker.onmessage` pushes as replies arrive, `for await` on the other end consumes them in order. Not a general-purpose utility — just enough for one Worker reply stream per request id. */
function makeChannel<T>(): Channel<T> {
  const queue: T[] = []
  let waiting: { resolve: (v: IteratorResult<T>) => void; reject: (e: unknown) => void } | null = null
  let closed = false

  function push(item: T) {
    if (waiting) {
      const w = waiting
      waiting = null
      w.resolve({ value: item, done: false })
    } else {
      queue.push(item)
    }
  }
  function close() {
    closed = true
    if (waiting) {
      const w = waiting
      waiting = null
      w.resolve({ value: undefined as unknown as T, done: true })
    }
  }
  function fail(err: unknown) {
    closed = true
    if (waiting) {
      const w = waiting
      waiting = null
      w.reject(err)
    }
  }
  const iterator: AsyncIterator<T> = {
    next(): Promise<IteratorResult<T>> {
      if (queue.length > 0) return Promise.resolve({ value: queue.shift() as T, done: false })
      if (closed) return Promise.resolve({ value: undefined as unknown as T, done: true })
      return new Promise((resolve, reject) => {
        waiting = { resolve, reject }
      })
    },
  }
  return { push, close, fail, [Symbol.asyncIterator]: () => iterator }
}

let worker: Worker | null = null
let nextId = 0
const channels = new Map<number, Channel<AiWorkerReply>>()

function getWorker(): Worker {
  if (!worker) {
    worker = new AiWorkerCtor()
    worker.onmessage = (e: MessageEvent<AiWorkerReply>) => {
      const reply = e.data
      const ch = channels.get(reply.id)
      if (!ch) return // already settled (e.g. by onerror), or stale — ignore, don't throw
      if (reply.kind === 'error') {
        channels.delete(reply.id)
        ch.fail(new Error(reply.error))
        return
      }
      ch.push(reply)
      if (reply.kind === 'done') {
        channels.delete(reply.id)
        ch.close()
      }
    }
    // A Worker-level failure (bundle error, out of memory) has no `id` to
    // route to one caller — every request still waiting is rejected so
    // nothing hangs forever, same as `analyzer-worker/index.ts`.
    worker.onerror = (e: ErrorEvent) => {
      const message = e.message || 'worker error'
      for (const ch of channels.values()) ch.fail(new Error(message))
      channels.clear()
    }
  }
  return worker
}

function send(req: AiWorkerRequest): Channel<AiWorkerReply> {
  const ch = makeChannel<AiWorkerReply>()
  channels.set(req.id, ch)
  getWorker().postMessage(req)
  return ch
}

async function load(onProgress: (pct: number) => void): Promise<void> {
  const ch = send({ id: nextId++, kind: 'load' })
  for await (const reply of ch) {
    if (reply.kind === 'progress') onProgress(reply.pct)
  }
}

async function* chatImpl(msgs: AIMessage[], tools: AIToolDef[]): AsyncGenerator<AIChatChunk> {
  const ch = send({ id: nextId++, kind: 'chat', msgs, tools })
  for await (const reply of ch) {
    if (reply.kind === 'text') yield { kind: 'text', delta: reply.delta }
    else if (reply.kind === 'toolCall') yield { kind: 'toolCall', call: reply.call }
    else if (reply.kind === 'done') yield { kind: 'done' }
    // 'progress' replies land here too when `chat()` triggers the model's
    // first-ever load itself (no prior `load()` call) — `controls.ts`
    // always calls `load()` up front on `toggleAiControl(true)`, so this is
    // a defensive fallback path, not the normal one, and has nothing useful
    // to yield as an `AIChatChunk`.
  }
}

export const aiLocalProvider: AIProvider = {
  id: 'local',
  kind: 'local',
  // A Worker is the only supported path here (the model and its runtime
  // have no business on the main thread) — no Worker capability, no
  // provider, degrading visibly through the same `available` flag the rest
  // of the AI pipeline already checks, rather than constructing a `Worker`
  // that Chromium doesn't support and failing later and less clearly.
  available: detectCapabilities().webWorker,
  capabilities: ['chat'],
  async suggest(): Promise<AISuggestion[]> {
    return []
  },
  chat(msgs: AIMessage[], tools: AIToolDef[] = []) {
    return chatImpl(msgs, tools)
  },
  load,
}
