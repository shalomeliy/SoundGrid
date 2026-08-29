import { beforeAll, describe, expect, it } from 'vitest'
import { git, requireGit } from './repo.ts'

/**
 * `CLAUDE.md` is authoritative and loads automatically; `CLAUDE-HE.md` is the
 * copy the project owner — who is not a programmer — actually reads. The standing
 * rule is that an edit to one goes into the other in the same commit. It was the
 * only rule in the project with nothing enforcing it, and the two files silently
 * describing different rules is a failure the owner cannot see from their side.
 *
 * What this checks is co-editing, not co-content: two files touched in one commit
 * can still say different things, and no test can read Hebrew against English to
 * find out. It closes the case that actually happened — one file edited, the
 * other forgotten — and the failure message claims nothing more than that.
 */
const PAIR = ['CLAUDE.md', 'CLAUDE-HE.md'] as const

describe('CLAUDE.md and CLAUDE-HE.md move together', () => {
  beforeAll(requireGit)

  it('are edited in the same commit', () => {
    // Parse the path field rather than substring-matching the whole output:
    // `status.includes('CLAUDE.md')` happens to be false for a dirty
    // CLAUDE-HE.md today, and that is luck, not a property worth relying on.
    //
    // Not by column, though: `git()` trims, so " M CLAUDE.md" arrives as
    // "M CLAUDE.md" and a fixed `slice(3)` eats the first letter of the name.
    // The filter then matched nothing, the one-file-dirty branch never ran, and
    // the test passed on exactly the case it exists to catch. Found by running
    // the falsification again after the fix — reading it proved nothing.
    const dirty = git('status', '--porcelain', '--', ...PAIR)
      .split('\n')
      .map((l) => l.trim().replace(/^\S{1,2}\s+/, ''))
      .filter((f): f is (typeof PAIR)[number] => (PAIR as readonly string[]).includes(f))

    if (dirty.length === 1) {
      expect.fail(
        `${dirty[0]} has uncommitted changes and ${PAIR.find((f) => f !== dirty[0])} does not.\n` +
          'The two files must never drift: carry the same change into both before committing.',
      )
    }
    // Both dirty is the rule being satisfied, not skipped — the pair is moving
    // together right now, and the commit below will be checked on the next run.
    if (dirty.length === 2) return

    const [a, b] = PAIR.map((f) => git('log', '-1', '--format=%H%n%s', '--', f).split('\n'))
    expect(
      a?.[0],
      `CLAUDE.md was last changed in "${a?.[1]}" but CLAUDE-HE.md in "${b?.[1]}".\n` +
        'They were not edited in the same commit, so one of them may carry a rule the\n' +
        'other does not. Read both and reconcile them.',
    ).toBe(b?.[0])
  })
})
