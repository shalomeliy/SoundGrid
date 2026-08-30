import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { ROOT, git, requireGit } from './repo.ts'

/**
 * `CLAUDE.md` — the file that loads automatically into every session and is the
 * authority on what is allowed in this repo — sat on `main` with two unresolved
 * conflict regions in it, `<<<<<<< ours` through `>>>>>>> theirs`, across v0.2.1,
 * v0.2.2 and v0.2.3. Both sides were committed verbatim, so the rules section
 * stated a thing and its own contradiction: one side said the doc invariants are
 * enforced by `tests/repo/`, the other said "nothing enforces any of this" and
 * that `package.json` still reads `"version": "0.0.0"`. The stale side had been
 * false since v0.2.1.
 *
 * `npm run check` stayed green the whole time. That is the finding, not the typo:
 * five repo invariants read the docs for *meaning* — sizes, paths, SHAs, version
 * drift, co-editing — and not one read them for *damage*. `tsc` and `oxlint` would
 * have caught this instantly in a `.ts` file; markdown has no compiler, so prose
 * is where a broken merge can live indefinitely. Every file gets checked here, not
 * just the docs, because the reason this survived is that nothing was looking.
 */

/**
 * **Two of the four markers are excluded, both by name.**
 *
 * `=======` on its own is also a markdown setext underline (`Title` over
 * `=======` is an H1). `|||||||` — the base section under
 * `merge.conflictStyle=diff3`/`zdiff3` — is also a valid empty markdown table
 * row. Including either would fail on legitimate content.
 *
 * What that costs, stated rather than left to be discovered: a **half-resolved**
 * file, where someone deleted the outer markers and left the middle, reads as
 * clean here. An untouched region — the case that actually happened, and the one
 * a person is least likely to notice — always writes `<<<<<<<` and `>>>>>>>`,
 * and neither has a second meaning at the start of a line. So the two markers
 * relied on catch every intact conflict with no false positive.
 *
 * Note also that this check has **no escape hatch**, unlike `doc-paths`'s
 * `<!-- dead-path -->`: a doc that wants to show a raw conflict region must
 * indent it or write it inline in backticks rather than open a fence at column
 * 0. That is a real constraint and the way out does not weaken the rule.
 */
const OPEN = '<'.repeat(7)
const CLOSE = '>'.repeat(7)

/**
 * The markers are built from `repeat` rather than written out so that this file
 * is scanned by the same rule as every other one. A literal here would need an
 * exemption for the test's own path, and an exempted file is exactly where the
 * next broken merge would be free to sit.
 */
const isMarker = (line: string): boolean => line.startsWith(OPEN) || line.startsWith(CLOSE)

/**
 * The same three flags `doc-paths` uses, and for the same reason it records: plain
 * `ls-files` lists only what is staged, so a file written earlier in this very
 * session is invisible to it. The normal order of work is write → `npm run check`
 * → `git add` → commit, which would put a newly authored conflict region past the
 * gate on the one run that matters and catch it only on the next. A delay like
 * that in the check whose whole reason for existing is that nothing was looking
 * is not a gap worth accepting.
 */
const tracked = (): string[] =>
  git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)

/**
 * Binary blobs are skipped by content — a NUL byte — rather than by an extension
 * list, so a format added later is covered without anyone remembering to register
 * it. `skipped` and `unreadable` are carried out rather than dropped: a file this
 * check quietly failed to read is a file it did not check, and "how does the user
 * find out?" has to have an answer here too.
 */
function classify(): { text: string[]; skipped: string[]; unreadable: string[] } {
  const text: string[] = []
  const skipped: string[] = []
  const unreadable: string[] = []
  for (const rel of tracked()) {
    try {
      if (readFileSync(join(ROOT, rel)).includes(0)) skipped.push(rel)
      else text.push(rel)
    } catch {
      unreadable.push(rel)
    }
  }
  return { text, skipped, unreadable }
}

describe('no file carries unresolved conflict markers', () => {
  beforeAll(requireGit)

  const { text, skipped, unreadable } = classify()

  /**
   * Printed on every run, not only on failure. The repo's own standard for this
   * is the library header's "N skipped · mp4" badge: what is left out is named
   * *and counted* where someone will see it. A skip that is only visible in an
   * assertion message is invisible exactly when the check passes.
   */
  beforeAll(() => {
    console.log(`no-conflict-markers: scanned ${text.length} text files, skipped ${skipped.length} binary` + (skipped.length ? ` (${skipped.join(', ')})` : ''))
  })

  it('every tracked text file is clean', () => {
    const found: string[] = []
    for (const rel of text) {
      readFileSync(join(ROOT, rel), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          // `split('\n')` leaves a trailing `\r` on CRLF files; matching on the
          // prefix means that does not hide a marker.
          if (isMarker(line)) found.push(`${rel}:${i + 1} → ${line.slice(0, 40)}`)
        })
    }
    expect(
      found,
      `Unresolved merge conflict markers are committed here:\n${found.join('\n')}\n` +
        'Both sides of the merge are in the file, so it states a thing and its own\n' +
        'contradiction. Read both sides, decide which is true now, and delete the rest —\n' +
        'do not keep both. If the file is one of the two CLAUDE files, reconcile against\n' +
        `the other one before deciding.\n(Scanned ${text.length} files; skipped ${skipped.length} binary.)`,
    ).toEqual([])
  })

  /**
   * A tracked path this check cannot open is not a pass — it is the check not
   * running, which is the failure mode this whole file exists to close. Named, so
   * it can never be the quiet gap.
   */
  it('every tracked file was actually readable', () => {
    expect(
      unreadable,
      `These tracked paths could not be read, so they were NOT scanned:\n${unreadable.join('\n')}\n` +
        'A file the check skipped silently is a file the check did not cover.',
    ).toEqual([])
  })
})
