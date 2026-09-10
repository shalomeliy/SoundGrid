/**
 * Pure FX math (v0.7.0) — beat-synced timing and the wet/dry blend curve. No
 * React, no DOM, no AudioContext: the same "extracted for real unit tests"
 * move `padmodes.ts`/`beatgrid.ts` already made. `platform/audio-webaudio/
 * fx.ts` owns the actual AudioNode graph; this file only computes the
 * numbers that feed it.
 */

/** The 4 effects in this version's FX rack, in the order `ROADMAP.md` lists them. Bit Crusher/Roll/Flanger/Phaser are v0.7.1. */
export const FX_EFFECTS = ['delay', 'echo', 'reverb', 'filter'] as const
export type FxEffect = (typeof FX_EFFECTS)[number]

/** Beat-synced time steps, in beats — the roadmap's own "1/4…4 beats" range. */
export const FX_TIME_STEPS = [0.25, 0.5, 1, 2, 4] as const

/**
 * A beat fraction, at a given BPM, in seconds — the one formula every
 * beat-synced FX parameter (Delay/Echo's delay time, Filter's sweep period)
 * is computed from. `null`/non-positive BPM falls back to a fixed half
 * second rather than 0 or `Infinity`: a `DelayNode.delayTime` of 0 would
 * read as "no delay at all" rather than "BPM unknown", the exact silent
 * substitution this project's central rule forbids — a fixed, audibly
 * wrong value is a better bug report than a value that looks like a
 * different, valid choice.
 */
export function beatFractionToSeconds(bpm: number | null, fraction: number): number {
  if (!bpm || bpm <= 0) return 0.5
  return (60 / bpm) * fraction
}

/**
 * Equal-power crossfade weights for a 0..1 mix knob (0 = fully dry, 1 =
 * fully wet). Same curve `engine.ts`'s `setCrossfader` already uses for the
 * A/B crossfader — factored out here so the FX wet/dry blend and the
 * crossfader can never drift into two different-sounding curves by
 * accident. `setCrossfader` calls this instead of computing inline.
 */
export function equalPowerMix(t: number): { dry: number; wet: number } {
  const c = Math.max(0, Math.min(1, t))
  return {
    dry: Math.cos((c * Math.PI) / 2),
    wet: Math.cos(((1 - c) * Math.PI) / 2),
  }
}
