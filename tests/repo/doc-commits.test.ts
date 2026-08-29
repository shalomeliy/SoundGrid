import { describe, expect, it } from 'vitest'
import { docFiles, git, numberedLines } from './repo.ts'

/**
 * The docs argue from history — "the gap was invisible (`59c5fe5`)" is how this
 * project records why an invariant exists, and a session is expected to be able
 * to run `git show` on it. A SHA that resolves to nothing turns that reasoning
 * into an assertion nobody can check.
 *
 * Only backticked tokens are checked — that is the convention every SHA in these
 * docs already follows, and a bare hex word in prose is far more often a MIDI
 * byte or a colour than a commit.
 *
 * This is also the tail of a real failure: HANDOFF.md pinned a commit SHA in its
 * push-status line, the line aged into a false claim about the repo's state, and
 * `969f004` removed it. A SHA in the docs is a claim, and claims get checked.
 */
/**
 * A named exclusion, not an omission: the token must contain a hex letter, so
 * `16777215` (0xFFFFFF written out in serato-formats.md) is not mistaken for a
 * commit. The cost is an all-digit abbreviation — ~4% of 7-character prefixes —
 * going unchecked. Worth it against a rule that cries wolf on every constant.
 */
const SHA = /`(?=[0-9a-f]*[a-f])([0-9a-f]{7,40})`/g

describe('commit SHAs cited in the docs resolve', () => {
  it.each(docFiles())('%s', (file) => {
    const missing: string[] = []
    for (const { n, text } of numberedLines(file)) {
      for (const [, sha] of text.matchAll(SHA)) {
        let type = ''
        try {
          type = git('cat-file', '-t', sha)
        } catch {
          // `cat-file` exits non-zero for an unknown object; that is the finding.
        }
        if (type !== 'commit') missing.push(`${file}:${n} → ${sha} (${type || 'unknown object'})`)
      }
    }
    expect(
      missing,
      `These look like commit SHAs but do not resolve:\n${missing.join('\n')}\n` +
        'A wrong SHA is worse than none — it reads as evidence. Correct it or drop the reference.',
    ).toEqual([])
  })
})
