import { describe, expect, it } from 'vitest'
import { read } from './repo.ts'

/**
 * `HANDOFF.md` is read first in every conversation, which makes its size the
 * single largest standing context cost in the repo. On 2026-08-29 it grew from
 * 20,602 to 43,916 bytes in one day — +97% — and roughly 4.5KB of that was the
 * section describing the problem. Discipline does not hold a file like this
 * down; a budget plus an archive directory does.
 *
 * The budget is deliberately loose. A choking budget creates pressure to weaken
 * the test instead of moving a block out, which is the failure mode that makes
 * a check worthless. 16,000 bytes is ~18% above the 13,512 the file measured right
 * after the v0.2.1 split — a number that reproduces with `wc -c HANDOFF.md`, which
 * an earlier draft of this comment did not: it recorded a count taken mid-edit and
 * was 19 bytes off. In a project whose definition of verification is "numbers
 * written down", a number that does not reproduce is the crack the standard opens on.
 */
const BUDGET_BYTES = 16_000

describe('HANDOFF.md size budget', () => {
  it(`stays under ${BUDGET_BYTES} bytes`, () => {
    const bytes = Buffer.byteLength(read('HANDOFF.md'), 'utf8')
    expect(
      bytes,
      `HANDOFF.md is ${bytes} bytes, over the ${BUDGET_BYTES}-byte budget.\n` +
        'Do not raise the budget. Move a closed version block into docs/handoff/<version>.md\n' +
        'and leave a link — the root file holds the present only.',
    ).toBeLessThanOrEqual(BUDGET_BYTES)
  })
})
