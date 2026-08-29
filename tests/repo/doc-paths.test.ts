import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { ROOT, docFiles, git, numberedLines, requireGit } from './repo.ts'

/**
 * v0.1.6 moved every file into core/ · platform/ · app/. Two days later
 * HANDOFF.md's architecture map still walked a reader through `audio/engine.ts`,
 * `library/tags.ts` and `midi/manager.ts`, and README.md still linked the FLX4
 * map at `src/midi/mappings/flx4.ts` — a dead link on the repo's front page.
 * Nothing noticed, because a wrong path in prose costs nothing until someone
 * follows it.
 *
 * **Two forms, because the docs use two.** The first version of this test only
 * matched fully-prefixed paths, and an independent review caught that this missed
 * the very map it was written for: the map is an indented tree, so `src/` appears
 * once at the top and every line under it is a bare `library/tags.ts`. A check
 * that cannot see the highest-drift surface in the repo while the docs claim it
 * is covered is worse than no check.
 *
 * So a fragment with a slash and a source extension is resolved as a **suffix**
 * against `git ls-files`: `mappings/flx4.ts` matches
 * `src/platform/transport-webmidi/mappings/flx4.ts` and passes; `midi/manager.ts`
 * matches nothing and fails. That is the form the tree writes.
 *
 * Still not covered, said plainly rather than left to be discovered: a bare
 * filename with no slash (`engine.ts`, `tags.ts`) is ambiguous by construction
 * and is not checked. Directory lines in a tree (`audio/`, `midi/`) are only
 * caught through their prefixed form — any pattern loose enough to catch a bare
 * `audio/` also catches `BPM/key` and `HipHop/House/` in ordinary prose.
 *
 * A path that is *supposed* to be dead — naming an old layout to explain a
 * move — is exempted by a named marker on the line, never by omission:
 *
 *     the old `audio/engine.ts` became platform/  <!-- dead-path -->
 */
const MARKER = '<!-- dead-path -->'

/**
 * The lookbehind keeps the prefix a real path start: without it `mysrc/x` and
 * the `/docs/` inside an external URL both read as repo paths.
 */
const PREFIXED = /(?<![A-Za-z0-9_/-])(?:src|tests|docs)\/[A-Za-z0-9_./-]*/g
/** `dir/file.ext` — at least one slash, and an extension this repo actually uses. */
const SUFFIX =
  /(?<![A-Za-z0-9_/-])[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.(?:tsx?|cjs|js|css|json|md|html)(?![A-Za-z0-9_-])/g
const LINK = /\]\(([^)\s]+)\)/g

const FILES = git('ls-files').split('\n')

/** Trailing sentence punctuation is not part of the path. */
const trim = (p: string): string => p.replace(/[.,:;]+$/, '')

/** Resolvable from the repo root, or the tail of a file that is. */
const resolves = (p: string): boolean =>
  existsSync(join(ROOT, p)) || FILES.some((f) => f === p || f.endsWith(`/${p}`))

describe('paths named in the docs exist', () => {
  beforeAll(requireGit)

  const files = docFiles()

  it('finds documentation to check', () => {
    expect(files.length).toBeGreaterThan(4)
    expect(FILES.length).toBeGreaterThan(20)
  })

  it.each(files)('%s cites only real repo paths', (file) => {
    const dead: string[] = []
    for (const { n, text } of numberedLines(file)) {
      if (text.includes(MARKER)) continue
      const found = [...(text.match(PREFIXED) ?? []), ...(text.match(SUFFIX) ?? [])]
      for (const raw of new Set(found)) {
        const p = trim(raw)
        // Globs describe a set, not a file; `src` alone is the tree itself.
        if (p.includes('*') || p.replace(/\/$/, '').split('/').length < 2) continue
        if (!resolves(p)) dead.push(`${file}:${n} → ${p}`)
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
      // The marker exempts both checks. It did not, at first: a historical link
      // could only be got past by deleting it, which is the pressure to weaken a
      // check that the size budget is explicitly designed against.
      if (text.includes(MARKER)) continue
      for (const [, target] of text.matchAll(LINK)) {
        if (/^(https?:|mailto:|#)/.test(target)) continue
        const rel = target.split('#')[0]
        if (!rel) continue
        const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.'
        if (!existsSync(join(ROOT, base, rel))) broken.push(`${file}:${n} → ${target}`)
      }
    }
    expect(
      broken,
      `Broken relative links:\n${broken.join('\n')}\n` +
        `Fix the link, or if it is deliberately historical add ${MARKER} to the line.`,
    ).toEqual([])
  })
})
