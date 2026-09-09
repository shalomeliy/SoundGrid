/**
 * The menu of actions v0.5.5's local model is allowed to call, and the gate
 * every tool call must pass before it reaches `controls.ts`. Pure — no
 * import of `controls.ts`, the store, or React; `controls.ts` owns the
 * actual dispatch (tool name -> real function call), same split as
 * `core/padmodes.ts`'s math versus `controls.ts`'s engine/store access.
 *
 * Deliberately its own vocabulary, not `ControlAction`/`Binding`
 * (`core/mapping/mapping.ts`) — those are MIDI-native (raw 0..127, a
 * `param` index) and are the wrong shape for a model to reason about or
 * emit. `deck: 'A'`, not `param: 100`.
 */
import type { AIToolCall, AIToolDef, JsonSchema } from '@/core/ports/ai'
import { LOOP_BEATS_STEPS } from '@/core/padmodes'

const deckArg: JsonSchema = {
  type: 'string',
  enum: ['A', 'B'],
  description: 'Which deck: A or B',
}
const unitArg: JsonSchema = { type: 'number', description: 'From -1 (fully down/left) to 1 (fully up/right)' }
const levelArg: JsonSchema = { type: 'number', description: 'From 0 (silent) to 1 (full)' }

/**
 * Every real action the model may call. `clarify`/`decline` are always
 * offered alongside these — the model must pick one of the two when a
 * request is ambiguous or asks for a capability that does not exist yet,
 * instead of guessing the nearest real action.
 */
export const AI_SAFE_ACTIONS = [
  'play',
  'pause',
  'loop',
  'jumpToHotCue',
  'syncDeck',
  'tapTempo',
  'setFilter',
  'setCrossfader',
  'setChannelVolume',
  'setEq',
] as const

export type AiSafeAction = (typeof AI_SAFE_ACTIONS)[number]

export const AI_TOOL_CATALOG: AIToolDef[] = [
  {
    name: 'play',
    description: 'Start playback on a deck.',
    parameters: { type: 'object', properties: { deck: deckArg }, required: ['deck'] },
  },
  {
    name: 'pause',
    description: 'Stop playback on a deck.',
    parameters: { type: 'object', properties: { deck: deckArg }, required: ['deck'] },
  },
  {
    name: 'loop',
    description: 'Start (or stop, if already looping at this length) a beat-length loop at the current position.',
    parameters: {
      type: 'object',
      properties: {
        deck: deckArg,
        beats: { type: 'number', enum: [...LOOP_BEATS_STEPS], description: 'Loop length in beats' },
      },
      required: ['deck', 'beats'],
    },
  },
  {
    name: 'jumpToHotCue',
    description: 'Jump to (or set, if empty) a saved hot cue point on a deck.',
    parameters: {
      type: 'object',
      properties: { deck: deckArg, index: { type: 'number', description: '0-based pad index, 0..7' } },
      required: ['deck', 'index'],
    },
  },
  {
    name: 'syncDeck',
    description: "Phase-lock a deck's tempo to the master deck.",
    parameters: { type: 'object', properties: { deck: deckArg }, required: ['deck'] },
  },
  {
    name: 'tapTempo',
    description: "Register one tap of a deck's tempo-tap.",
    parameters: { type: 'object', properties: { deck: deckArg }, required: ['deck'] },
  },
  {
    name: 'setFilter',
    description: "Move a deck's filter knob.",
    parameters: { type: 'object', properties: { deck: deckArg, amount: unitArg }, required: ['deck', 'amount'] },
  },
  {
    name: 'setCrossfader',
    description: 'Move the crossfader (-1 = fully deck A, 1 = fully deck B).',
    parameters: { type: 'object', properties: { position: unitArg }, required: ['position'] },
  },
  {
    name: 'setChannelVolume',
    description: "Set a deck's channel fader level.",
    parameters: { type: 'object', properties: { deck: deckArg, level: levelArg }, required: ['deck', 'level'] },
  },
  {
    name: 'setEq',
    description: "Move one of a deck's EQ knobs.",
    parameters: {
      type: 'object',
      properties: {
        deck: deckArg,
        band: { type: 'string', enum: ['low', 'mid', 'high'] },
        amount: unitArg,
      },
      required: ['deck', 'band', 'amount'],
    },
  },
  {
    name: 'clarify',
    description:
      'Ask the user a short clarifying question instead of guessing, when the request is ambiguous (which deck, which point, etc).',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string' } },
      required: ['question'],
    },
  },
  {
    name: 'decline',
    description:
      "State plainly that the request needs a capability the app does not have yet, instead of performing a nearby but wrong action.",
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason'],
    },
  },
]

function typeOf(v: unknown): JsonSchema['type'] | 'other' {
  if (typeof v === 'string') return 'string'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  if (v !== null && typeof v === 'object') return 'object'
  return 'other'
}

/**
 * Minimal validator for the flat, one-level-deep shapes every tool in this
 * catalog actually uses — not a general JSON Schema implementation.
 */
function schemaError(value: unknown, schema: JsonSchema, path: string): string | null {
  const actual = typeOf(value)
  if (actual !== schema.type) return `${path} should be ${schema.type}, got ${actual}`
  if (schema.enum && !schema.enum.includes(value as string | number)) {
    return `${path} must be one of ${schema.enum.join(', ')} — got ${JSON.stringify(value)}`
  }
  if (schema.type === 'object') {
    const obj = value as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (!(key in obj)) return `${path} is missing required field "${key}"`
    }
    for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
      if (key in obj) {
        const err = schemaError(obj[key], propSchema, `${path}.${key}`)
        if (err) return err
      }
    }
  }
  return null
}

/**
 * The validation gate between "the model said it wants to call this" and
 * "`controls.ts` actually runs something". Anything that fails here is
 * rejected with a human-readable reason and never reaches the engine —
 * this is what stops a hallucinated or malformed tool call from silently
 * no-op'ing the way an unrecognised MIDI binding does today
 * (`transport-webmidi/manager.ts`'s `dispatch`).
 */
export function validateToolCall(call: AIToolCall): { ok: true; call: AIToolCall } | { ok: false; reason: string } {
  const def = AI_TOOL_CATALOG.find((t) => t.name === call.name)
  if (!def) return { ok: false, reason: `"${call.name}" is not a known action` }
  const err = schemaError(call.args ?? {}, def.parameters, call.name)
  if (err) return { ok: false, reason: err }
  return { ok: true, call }
}
