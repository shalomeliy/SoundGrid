import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repo root, resolved from this file so the tests work from any cwd. */
export const ROOT = fileURLToPath(new URL('../..', import.meta.url))

export const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')

/**
 * stderr is captured rather than inherited: `cat-file` on an unknown object
 * prints "fatal: Not a valid object name" and the caller treats that as the
 * finding. Letting it through would bury the assertion message in git noise.
 */
export const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/**
 * Three of these invariants ask git questions. Run from an exported tarball or a
 * tree without `.git` they would each fail with a raw spawn error, and the reader
 * would debug five confusing failures instead of one clear one. Fail once, by
 * name — the check is genuinely unavailable, which is not the same as passing.
 */
export function requireGit(): void {
  try {
    if (git('rev-parse', '--is-inside-work-tree') === 'true') return
  } catch {
    // falls through to the named failure below
  }
  throw new Error(
    'tests/repo/ needs a git work tree — these invariants ask git about commits and\n' +
      'about which files are dirty. Run them from a clone, not from an export.',
  )
}

/**
 * Every markdown file that a session might read. The invariants below are about
 * documentation drifting away from the repo, so the set has to be discovered
 * rather than listed — a doc added later and never registered here would be
 * exactly the unchecked file the rules exist to prevent.
 */
export function docFiles(): string[] {
  const roots = ['CLAUDE.md', 'CLAUDE-HE.md', 'README.md', 'HANDOFF.md', 'ROADMAP.md']
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.md') ? [`${dir}/${e.name}`] : [],
    )
  return [...roots, ...walk('docs')].sort()
}

/** `path/to/file.md` → its lines, 1-based line numbers attached. */
export function numberedLines(rel: string): { n: number; text: string }[] {
  return read(rel)
    .split('\n')
    .map((text, i) => ({ n: i + 1, text }))
}
