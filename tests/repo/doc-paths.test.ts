import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT, docFiles, numberedLines } from './repo.ts'

/**
 * v0.1.6 moved every file into core/ · platform/ · app/. Two days later
 * HANDOFF.md's architecture map still walked a reader through `src/audio/`,
 * `src/library/` and `src/midi/`, and README.md still linked the FLX4 map at
 * `src/midi/mappings/flx4.ts` — a dead link on the repo's front page. Nothing
 * noticed, because a wrong path in prose costs nothing until someone follows it.
 *
 * A path that is *supposed* to be dead — naming an old layout to explain a
 * move — is exempted by a named marker on the line, never by omission:
 *
 *     the old `src/audio/engine.ts` became platform/  <!-- dead-path -->
 */
const MARKER = '<!-- dead-path -->'
/**
 * The lookbehind keeps the prefix a real path start: without it `mysrc/x` and
 * the `/docs/` inside an external URL both read as repo paths and the rule
 * cries wolf.
 *
 * Coverage this does NOT have, stated rather than left to be discovered: a file
 * named without one of the three prefixes — `mappings/flx4.ts`, `tags.ts` — is
 * invisible to it. Prose names files that way often, and any pattern loose
 * enough to catch them matches ordinary words too. Write the prefix when the
 * path matters.
 */
const PATH = /(?<![A-Za-z0-9_/-])(?:src|tests|docs)\/[A-Za-z0-9_./-]*/g
const LINK = /\]\(([^)\s]+)\)/g

/** Trailing sentence punctuation is not part of the path. */
const trim = (p: string): string => p.replace(/[.,:;]+$/, '')

describe('paths named in the docs exist', () => {
  const files = docFiles()

  it('finds documentation to check', () => {
    expect(files.length).toBeGreaterThan(4)
  })

  it.each(files)('%s cites only real repo paths', (file) => {
    const dead: string[] = []
    for (const { n, text } of numberedLines(file)) {
      if (text.includes(MARKER)) continue
      for (const raw of text.match(PATH) ?? []) {
        const p = trim(raw)
        // Globs describe a set, not a file; `src` alone is the tree itself.
        if (p.includes('*') || p.replace(/\/$/, '').split('/').length < 2) continue
        if (!existsSync(join(ROOT, p))) dead.push(`${file}:${n} → ${p}`)
      }
    }
    expect(
      dead,
      `These paths do not exist:\n${dead.join('\n')}\n` +
        `Fix the path, or if it is deliberately historical add ${MARKER} to the line.`,
    ).toEqual([])
  })

  it.each(files)('%s has no broken relative link', (file) => {
    const broken: string[] = []
    for (const { n, text } of numberedLines(file)) {
      for (const [, target] of text.matchAll(LINK)) {
        if (/^(https?:|mailto:|#)/.test(target)) continue
        const rel = target.split('#')[0]
        if (!rel) continue
        const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.'
        if (!existsSync(join(ROOT, base, rel))) broken.push(`${file}:${n} → ${target}`)
      }
    }
    expect(broken, `Broken relative links:\n${broken.join('\n')}`).toEqual([])
  })
})
