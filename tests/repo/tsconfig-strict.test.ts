import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * v0.2.7. `CLAUDE.md` opened with "React 19 + TypeScript (strict)" while not one
 * of the three tsconfigs set the flag, and it had said so since v0.1.0. Nothing
 * caught it because nothing was looking: the repo invariants read the docs for
 * meaning and the compiler read the code, and this claim lived in the gap
 * between them.
 *
 * The surprise was the cost. The flag was carried as debt for seven versions on
 * the assumption that turning it on would surface a pile of `possibly null`
 * errors to work through. It surfaced zero — `tsc -b` was clean the first time,
 * across app, node and test projects. The debt was never the errors; it was the
 * flag, and nobody had tried it.
 *
 * So this test is not about type quality, it is about the sentence at the top of
 * CLAUDE.md staying true. Turning `strict` off again is allowed only by editing
 * that sentence in the same commit — which is exactly the trade the check
 * exists to force.
 */
const CONFIGS = ['tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.test.json']

/**
 * JSON with comments — tsconfigs carry them, JSON.parse does not.
 *
 * String-aware on purpose. The first version stripped comments with a regex and
 * failed on two of the three files, because the path alias `"@/*"` contains the
 * characters that open a block comment: everything from there to the next `*​/`
 * vanished, and the parse died on a string with a newline in it. A stripper that
 * does not know where strings are will always eventually eat one.
 */
function readJsonc(path: string): Record<string, unknown> {
  const raw = readFileSync(path, 'utf8')
  let out = ''
  let inString = false
  let inLine = false
  let inBlock = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    const next = raw[i + 1]
    if (inLine) {
      if (c === '\n') { inLine = false; out += c }
      continue
    }
    if (inBlock) {
      if (c === '*' && next === '/') { inBlock = false; i++ }
      continue
    }
    if (inString) {
      out += c
      if (c === '\\') { out += next ?? ''; i++ } else if (c === '"') inString = false
      continue
    }
    if (c === '"') { inString = true; out += c; continue }
    if (c === '/' && next === '/') { inLine = true; i++; continue }
    if (c === '/' && next === '*') { inBlock = true; i++; continue }
    out += c
  }
  // trailing commas are legal in tsconfig and not in JSON
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1')) as Record<string, unknown>
}

describe('the strict flag CLAUDE.md promises', () => {
  for (const file of CONFIGS) {
    it(`${file} sets strict`, () => {
      const opts = readJsonc(file).compilerOptions as Record<string, unknown>
      expect(
        opts?.strict,
        `${file} does not set "strict": true, but CLAUDE.md says the project is ` +
          `TypeScript (strict). Change one or the other — never leave them disagreeing.`,
      ).toBe(true)
    })
  }

  it('CLAUDE.md and CLAUDE-HE.md both still claim it', () => {
    // if the claim is ever dropped, this test is the thing that should be
    // deleted with it — deliberately, not by a flag quietly flipping back
    for (const doc of ['CLAUDE.md', 'CLAUDE-HE.md']) {
      expect(readFileSync(doc, 'utf8'), doc).toMatch(/TypeScript \(strict/)
    }
  })
})
