import type { ControlAction } from '@/core/mapping/mapping'

/**
 * Human-readable names for the physical FLX4 control behind each
 * `ControlAction`, for Hint mode's "also on FLX4" line.
 *
 * Hand-authored, not derived from `FLX4_MAPPING`'s note/CC numbers — those
 * are hardware addresses, not names a DJ would recognise. `core/` cannot
 * import `platform/transport-webmidi/mappings/flx4.ts` (layering), so
 * `tests/core/hints.test.ts` cross-checks this table against the real
 * mapping instead, so the two can't silently drift apart.
 */
export const FLX4_LABELS: Partial<Record<ControlAction, string | ((param?: number) => string)>> = {
  play: 'Play button',
  cue: 'Cue button',
  sync: 'Sync button (tap: sync, hold: make master)',
  load: 'Load button',
  tempo: 'Tempo fader',
  jog: 'Jog wheel (turn)',
  jogTouch: 'Jog wheel (touch the platter top)',
  hotcue: (param) => `Pad ${(param ?? 0) + 1} (Hot Cue mode)`,
  loopToggle: 'Loop button',
  loopHalve: 'Loop ÷2 button',
  loopDouble: 'Loop ×2 button',
  channelVolume: 'Channel fader',
  crossfader: 'Crossfader',
  eqLow: 'Low EQ knob',
  eqMid: 'Mid EQ knob',
  eqHigh: 'High EQ knob',
  filter: 'Filter knob',
  masterVolume: 'Master level knob',
  cueVolume: 'Cue level knob',
  cueMix: 'Cue mix knob',
  cueMonitor: 'Headphone cue (PFL) button',
  browse: 'Browse encoder (turn)',
  browseEnter: 'Browse encoder (press)',
}

/** The label for one action, or null when this action has no FLX4 binding. */
export function flx4Label(action: ControlAction, param?: number): string | null {
  const entry = FLX4_LABELS[action]
  if (!entry) return null
  return typeof entry === 'function' ? entry(param) : entry
}
