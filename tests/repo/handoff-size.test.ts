import { describe, expect, it } from 'vitest'
import { read } from './repo.ts'

/**
 * `HANDOFF.md` is read first in every conversation, which makes its size the
 * single largest standing context cost in the repo. On 2026-08-29 it grew from
 * 20,602 to 43,916 bytes in one day — +97% — and roughly 4.5KB of that was the
 * section describing the problem. Discipline does not hold a file like this
 * down; a budget plus an archive directory does.
 *
 * The number is not this test's to choose. `HANDOFF.md`'s own header states the
 * budget, and it is one fact in two places — the doc a person reads and the check
 * that enforces it. 15,000 bytes, set by the split that shrank the file to 12.9KB;
 * loose on purpose, because a choking budget creates pressure to weaken the test
 * instead of moving a block out, which is the failure mode that makes a check
 * worthless. If you change it, change the header in the same commit.
 */
const BUDGET_BYTES = 15_000

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
