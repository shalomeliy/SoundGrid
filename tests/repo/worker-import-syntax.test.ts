import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { ROOT, git, requireGit } from './repo.ts'

/**
 * `platform/analyzer-worker/index.ts` and the new `platform/ai-local/index.ts`
 * (v0.5.5 phase 2) both constructed their Worker as
 * `new Worker(new URL('.../worker.ts', import.meta.url), { type: 'module' })`
 * — the pattern several bundlers auto-detect, but not Vite 8, whose worker
 * plugin looks for a `?worker` query on the import specifier
 * (`workerOrSharedWorkerRE` in `vite`'s source). Without it, `new URL(literal,
 * import.meta.url)` still gets Vite's *generic* asset-URL handling — the raw,
 * untranspiled `.ts` file is copied into `dist/assets/` byte-for-byte, bare
 * imports and type annotations included. `npm run dev` masks this completely
 * (Vite serves and transpiles anything on request, worker included), so the
 * feature looked and tested fine right up to `vite build`: the browser then
 * gets handed unparseable TypeScript, and `worker.onerror` fires with no
 * useful reason at all — exactly the silent-degrade this project's central
 * rule (`CLAUDE.md`) forbids, just one layer down from where the existing
 * checks look. Found while building `ai-local`'s own worker this same wrong
 * way and catching it against a real `vite build`, not `npm run dev`.
 *
 * The fix is `import Ctor from './worker.ts?worker'; new Ctor()` (both
 * `index.ts` files now do this) — this test is what stops a third worker
 * from being added the broken way and passing every check up to a
 * production build that nobody in this remote environment runs.
 */
describe('every Worker is constructed via the `?worker` import, not `new Worker(new URL(...))`', () => {
  beforeAll(requireGit)

  const srcFiles = (): string[] =>
    git('ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'src')
      .split('\0')
      .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))

  it('has no `new Worker(new URL(...))` / `new SharedWorker(new URL(...))` call left in src/', () => {
    const found: string[] = []
    for (const rel of srcFiles()) {
      const text = readFileSync(join(ROOT, rel), 'utf8')
      text.split('\n').forEach((line, i) => {
        // Requires a real string literal right after the inner `new URL(` —
        // doc comments describing the anti-pattern (this file's own header
        // included) write it with a literal `...)`, which does not match.
        if (/new\s+(Worker|SharedWorker)\s*\(\s*new\s+URL\s*\(\s*['"]/.test(line)) {
          found.push(`${rel}:${i + 1} → ${line.trim()}`)
        }
      })
    }
    expect(
      found,
      `These construct a Worker from a plain \`new URL(...)\`, which Vite 8 does not\n` +
        `recognize as a worker entry — it silently copies the raw, untranspiled source\n` +
        `as a generic asset instead, and only breaks once someone runs a real\n` +
        `\`vite build\` (which nothing in this remote environment does automatically):\n` +
        `${found.join('\n')}\n` +
        `Use \`import Ctor from './worker.ts?worker'\` and \`new Ctor()\` instead — see\n` +
        `\`platform/ai-local/index.ts\` or \`platform/analyzer-worker/index.ts\`.`,
    ).toEqual([])
  })
})
