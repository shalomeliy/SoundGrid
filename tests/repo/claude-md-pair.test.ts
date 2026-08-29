import { describe, expect, it } from 'vitest'
import { git } from './repo.ts'

/**
 * `CLAUDE.md` is authoritative and loads automatically; `CLAUDE-HE.md` is the
 * copy the project owner — who is not a programmer — actually reads. The standing
 * rule is that an edit to one goes into the other in the same commit. It was the
 * only rule in the project with nothing enforcing it, and the two files silently
 * describing different rules is a failure the owner cannot see from their side.
 */
const PAIR = ['CLAUDE.md', 'CLAUDE-HE.md'] as const

describe('CLAUDE.md and CLAUDE-HE.md move together', () => {
  it('are edited in the same commit', () => {
    // Parse the path field rather than substring-matching the whole output:
    // `status.includes('CLAUDE.md')` happens to be false for a dirty
    // CLAUDE-HE.md today, and that is luck, not a property worth relying on.
    const dirty = git('status', '--porcelain', '--', ...PAIR)
      .split('\n')
      .map((l) => l.slice(3).trim())
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
        'One of them carries a rule the other does not. Reconcile them.',
    ).toBe(b?.[0])
  })
})
