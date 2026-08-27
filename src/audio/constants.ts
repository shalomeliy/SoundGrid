/** Tempo fader travel: fader value of 1 => +8% playback rate. */
export const TEMPO_RANGE = 0.08

/** EQ gain in dB at the extremes of each band knob. */
export const EQ_DB = 26

/** Kill-ish behaviour: below this knob value the band is fully cut. */
export const EQ_LOW_HZ = 100
export const EQ_MID_HZ = 1000
export const EQ_HIGH_HZ = 6000

export const HOT_CUE_COLORS = [
  '#ff3b6b',
  '#ff8f29',
  '#ffd23b',
  '#3bff88',
  '#29c5ff',
  '#6b7bff',
  '#b14bff',
  '#ff5cf0',
]

export function tempoToRate(tempo: number): number {
  return 1 + tempo * TEMPO_RANGE
}
