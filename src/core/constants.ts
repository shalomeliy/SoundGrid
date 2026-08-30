/** Tempo fader travel: fader value of 1 => +8% playback rate. */
export const TEMPO_RANGE = 0.08

/**
 * Pitch bend from a key press, as a fraction of playback rate.
 *
 * A key is either down or up, so unlike a jog wheel it carries no "how hard".
 * 4% is the size of a nudge that closes a small phase gap in a beat or two —
 * enough to be useful, small enough that holding it does not sound like a
 * tempo change.
 */
export const KEYBOARD_BEND = 0.04

/**
 * Platter diameter in CSS px.
 *
 * It shipped at 54, which is ~41px of grabbable face — about **11mm** on the
 * user's 157-PPI screen, where every CSS px is ~0.76 of its nominal size. That
 * is a control you aim at, not one you scratch with.
 *
 * **Floor: never ship an interactive platter below 120 CSS px.** 142 costs no
 * height: the deck's left column measures 178px and the right column already
 * stretches to match it, so 142 + 4 + the 32px Vinyl chip fills exactly the
 * space that was there.
 */
export const PLATTER_SIZE = 142

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
