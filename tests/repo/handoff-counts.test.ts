import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT, numberedLines } from './repo'

/**
 * `HANDOFF.md` may not carry a number it cannot prove.
 *
 * The file went stale three times in one day (2026-08-30), and every time the
 * same way: a number that was true when it was written and false an hour later,
 * restated by the next reader because it looked like a fact. It claimed 117
 * tests when there were 122, and it claimed v0.2.4 was waiting outside `main`
 * when v0.2.4 had been merged in PR #3 — the very commit the branch was cut
 * from. Nobody lied; nobody checked.
 *
 * So the rule this encodes is not "be careful". It is a split:
 *
 * - **A count that can be verified here, is.** Test *files* are a directory
 *   listing, so a claim about them is checked against the disk.
 * - **A count that cannot be verified here, is not allowed.** Test *cases* are
 *   only known by running the suite, which is what is running this. A number
 *   nothing can check is a number that will go stale, and `HANDOFF.md` is the
 *   one file whose whole job is to be true right now.
 *
 * The archive under `docs/handoff/` is exempt on purpose: a closed version's
 * record is a snapshot of a moment, and "122 tests on 30/08" stays true forever
 * precisely because it is dated and frozen. Only the present tense has to keep
 * up.
 */

const countTestFiles = (): number => {
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.test.ts') ? [e.name] : [],
    )
  return walk('tests').length
}

describe('HANDOFF.md carries no number it cannot prove', () => {
  it('does not state a test-case count', () => {
    // "122 בדיקות" / "122 tests" — true when written, false by the next commit.
    const offenders = numberedLines('HANDOFF.md').filter((l) =>
      /\d+\s*(בדיקות|tests\b)/.test(l.text),
    )
    expect(
      offenders.map((l) => `HANDOFF.md:${l.n} — ${l.text.trim()}`),
      'A test-case count cannot be checked from inside the suite that would have to\n' +
        'count it, so it is guaranteed to age into a lie. Write that `npm run check` is\n' +
        'green and leave the number to the dated record in docs/handoff/<version>.md.',
    ).toEqual([])
  })

  it('states the test-file count correctly, if it states it at all', () => {
    // This one IS checkable, so it is checked rather than banned.
    const actual = countTestFiles()
    for (const l of numberedLines('HANDOFF.md')) {
      const m = l.text.match(/(\d+)\s*קבצי[ם]?\s*בדיקה|(\d+)\s*test files/i)
      if (!m) continue
      const claimed = Number(m[1] ?? m[2])
      expect(claimed, `HANDOFF.md:${l.n} claims ${claimed} test files; there are ${actual}.`).toBe(
        actual,
      )
    }
  })
})

describe('HANDOFF.md does not assert merge state it has not checked', () => {
  it('pairs any claim about main with the command that settles it', () => {
    /*
     * The failure: "v0.2.4 was pushed and is not yet merged to main" sat in the
     * status table long after PR #3 merged it, and was then copied forward and
     * emphasised by a reader who trusted the file. `doc-commits` checks that a
     * quoted SHA resolves; nothing checked that a claim about merge state was
     * true, and nothing here can — the answer lives on a remote.
     *
     * What is enforceable is that the claim never travels alone: the row that
     * makes it must also carry the command that disproves it in one line. That
     * is the difference between a fact a reader can check in five seconds and
     * one they can only inherit.
     */
    // Backticked, because the branch is always written as `main` in these docs
    // and the bare word is not: "Waveform on the main thread" is not a claim
    // about git, and a check that cannot tell the two apart gets switched off.
    const branchRows = numberedLines('HANDOFF.md').filter((l) => /`main`/.test(l.text))
    expect(
      branchRows.length,
      'HANDOFF.md never mentions `main` — has the status table moved?',
    ).toBeGreaterThan(0)
    const unverifiable = branchRows.filter((l) => !/git\s+(fetch|log|merge-base|status)/.test(l.text))
    expect(
      unverifiable.map((l) => `HANDOFF.md:${l.n} — ${l.text.trim().slice(0, 90)}`),
      'A line claiming what is or is not on main must name the git command that\n' +
        'settles it, on the same line. A claim about a remote cannot be checked from\n' +
        'here, so the next reader has to be able to check it themselves — otherwise\n' +
        'they will restate it instead, which is exactly what happened on 2026-08-30.',
    ).toEqual([])
  })
})
