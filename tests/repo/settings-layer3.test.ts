import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT, read } from './repo'

/**
 * The calibration constants must never grow a control on the Settings screen.
 *
 * v0.2.5 decided which numbers are **preferences** and which are **calibration**
 * — values that pin a bug already fixed. `PLATTER_SIZE` has a floor of 120px
 * bought in v0.2.3 and exposing it is an invitation to break it again;
 * `POSITION_EPSILON_SEC` is the fix for a frozen playhead. Each one is a
 * decision the user should never be asked to make, and a control for one is a
 * polite way to let them break the app for themselves.
 *
 * That was a paragraph in `ROADMAP.md`, which is to say it was nothing. This is
 * the check: a name from the list appearing in the settings surface fails the
 * gate, and the failure message says which file and which name.
 */
const LAYER_3 = [
  'POSITION_EPSILON_SEC',
  'DECLICK_SEC',
  'SILENT_BELOW_RATE',
  'ANCHOR_EVERY_QUANTA',
  'STANDSTILL',
  'HOLD_TIMEOUT_MS',
  'JOG_REPORT_MS',
  'QUIET',
  'PLATTER_SIZE',
]

/**
 * The files that decide what the user can change. Discovered, not listed: a
 * second settings screen added later and never registered here would be exactly
 * the unchecked file this exists to catch.
 */
function settingsSurface(): string[] {
  const files = ['src/core/settings.ts', 'src/core/ports/settings.ts']
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : /^Settings.*\.tsx?$/.test(e.name)
          ? [`${dir}/${e.name}`]
          : [],
    )
  return [...files, ...walk('src/app/components'), ...walk('src/platform/settings-idb')]
}

/**
 * Comments are stripped first, and that is the whole subtlety of this check.
 * `core/settings.ts` names every one of these constants **on purpose**, in the
 * paragraph explaining why they are excluded — a named exemption rather than a
 * silent omission, the same rule as `COMPANION_EXT`. A check that read the
 * comments would fail on the very documentation it exists to enforce.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('the settings screen exposes no calibration constant', () => {
  const files = settingsSurface()

  it('finds the settings surface at all', () => {
    // A rename that emptied this list would make every assertion below pass
    // while checking nothing.
    expect(files).toContain('src/core/settings.ts')
    expect(files.length).toBeGreaterThanOrEqual(3)
  })

  for (const rel of files) {
    it(`${rel} names none of them in code`, () => {
      const code = stripComments(read(rel))
      const found = LAYER_3.filter((name) => new RegExp(`\\b${name}\\b`).test(code))
      expect(
        found,
        `${rel} reaches for ${found.join(', ')}. These are calibration, not preferences —\n` +
          'each one pins a bug that is already fixed, and a control for it lets the user\n' +
          'break the app for themselves. If one genuinely became a preference, move it out\n' +
          'of the list in this test and say in the commit message what changed.',
      ).toEqual([])
    })
  }
})
