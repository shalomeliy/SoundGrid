/**
 * Message shapes crossing the main-thread/Worker boundary, same reason as
 * `analyzer-worker/protocol.ts`: `index.ts` and `worker.ts` agree on this
 * without importing each other. Unlike that one-shot request/response pair,
 * both requests here are inherently a *stream* of replies to one `id` (load
 * progress ticks, chat text deltas) ending in exactly one `done` or `error`
 * — the protocol reflects that instead of index.ts faking it on top.
 */
import type { AIMessage, AIToolCall, AIToolDef } from '@/core/ports/ai'

export type AiWorkerRequest = { id: number; kind: 'load' } | { id: number; kind: 'chat'; msgs: AIMessage[]; tools: AIToolDef[] }

export type AiWorkerReply =
  | { id: number; kind: 'progress'; pct: number }
  | { id: number; kind: 'text'; delta: string }
  | { id: number; kind: 'toolCall'; call: AIToolCall }
  | { id: number; kind: 'done' }
  | { id: number; kind: 'error'; error: string }
