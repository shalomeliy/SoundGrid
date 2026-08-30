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
 *
 * **`=======` is excluded by name, not by omission.** On its own it is also a
 * markdown setext underline (`Title` over `=======` is an H1), and this repo could
 * legitimately start using one. It costs nothing to skip: a conflict region always
 * writes all three markers, so `<<<<<<<` and `>>>>>>>` — which have no second
 * meaning at the start of a line — catch every real case with no false positive.
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
 * Tracked files only — a conflict lives in something git recorded. Binary blobs
 * are skipped by content (a NUL byte) rather than by an extension list, so a
 * format added later is covered without anyone remembering to register it.
 */
function textFiles(): string[] {
  return git('ls-files', '-z')
    .split('\0')
    .filter(Boolean)
    .filter((rel) => {
      try {
        return !readFileSync(join(ROOT, rel)).includes(0)
      } catch {
        // A path in the index with nothing on disk is another test's finding.
        return false
      }
    })
}

describe('no file carries unresolved conflict markers', () => {
  beforeAll(requireGit)

  it('every tracked text file is clean', () => {
    const found: string[] = []
    for (const rel of textFiles()) {
      readFileSync(join(ROOT, rel), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (isMarker(line)) found.push(`${rel}:${i + 1} → ${line.slice(0, 40)}`)
        })
    }
    expect(
      found,
      `Unresolved merge conflict markers are committed here:\n${found.join('\n')}\n` +
        'Both sides of the merge are in the file, so it states a thing and its own\n' +
        'contradiction. Read both sides, decide which is true now, and delete the rest —\n' +
        'do not keep both. If the file is one of the two CLAUDE files, reconcile against\n' +
        'the other one before deciding.',
    ).toEqual([])
  })
})
