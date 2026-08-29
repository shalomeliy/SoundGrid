import { describe, expect, it } from 'vitest'
import { read } from './repo.ts'

/**
 * `package.json` said `"version": "0.0.0"` while v0.2.0 was already on main.
 * The same drift in ESOP left `VERSION` on 0.5.1 through two releases and three
 * portals showed users a version that did not exist. The fix is not vigilance —
 * it is binding the number to the one place a session actually reads.
 */
const MARKER = /^- \*\*גרסה נוכחית:\*\* `v(\d+\.\d+\.\d+)`/m

describe('the declared version is the version', () => {
  const pkg = JSON.parse(read('package.json')) as { version: string }

  it('HANDOFF.md names the same version as package.json', () => {
    const found = MARKER.exec(read('HANDOFF.md'))
    expect(
      found,
      'HANDOFF.md has no "- **גרסה נוכחית:** `vX.Y.Z`" line.\n' +
        'That line is what binds the docs to package.json — restore it, do not delete this test.',
    ).not.toBeNull()
    expect(
      found?.[1],
      `HANDOFF.md says v${found?.[1]} and package.json says ${pkg.version}. Change both, in one commit.`,
    ).toBe(pkg.version)
  })

  it('ROADMAP.md has a row for it', () => {
    const roadmap = read('ROADMAP.md')
    expect(
      roadmap.includes(`v${pkg.version}`),
      `ROADMAP.md never mentions v${pkg.version}. A version being built is a version the roadmap knows about.`,
    ).toBe(true)
  })
})
