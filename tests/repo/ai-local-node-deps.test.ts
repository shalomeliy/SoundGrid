import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { git, ROOT } from './repo.ts'

/**
 * `npm audit` reports 4 high-severity findings under `@huggingface/transformers`
 * (`onnxruntime-node`, `sharp` — both Node-only native-binding dependencies).
 * `HANDOFF.md` records this as accepted, not fixed: the package's `exports` map
 * sends bundlers a separate `dist/transformers.web.js` for every condition except
 * `node`, and Vite (browser target) never requests the `node` condition — so
 * `platform/ai-local/worker.ts` never pulls either vulnerable package into the
 * shipped bundle.
 *
 * That claim was verified once, by hand, for v0.5.5. Nothing kept verifying it —
 * a version bump of `@huggingface/transformers` that collapsed the two builds
 * back into one, or a worker import changed to a `/node` subpath, would silently
 * turn "verified, no runtime exposure" into "shipped to the browser", and
 * `npm run check` would stay green throughout. This is exactly the silent-skip
 * this project forbids, just one dependency update away. So: a real check,
 * against the installed package, standing in for re-doing that verification by
 * hand before every commit.
 */
function findTransformersPkg(): { path: string; json: Record<string, unknown> } {
  const path = join(ROOT, 'node_modules/@huggingface/transformers/package.json')
  return { path, json: JSON.parse(readFileSync(path, 'utf8')) }
}

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Matches an actual `require(...)`/`import ... from`/dynamic `import(...)` of
 * the named bare specifier — not a comment mentioning it (the web build's own
 * source contains `// onnxruntime-web/onnxruntime-node`, an
 * `// ignore-modules:onnxruntime-node` bundler hint, and a JSDoc
 * `{import('sharp').Sharp}` type reference, none of which are real
 * dependencies) and not a JSON-ish string in unrelated generated text (the
 * app's own `oss-notices.generated.ts` legitimately lists `sharp` by name as
 * one of transformers' transitive licenses). */
const requiresPackage = (src: string, pkg: string): boolean =>
  new RegExp(`(require\\(\\s*|from\\s*|import\\(\\s*)['"]${pkg}['"]`).test(stripComments(src))

describe('ai-local never ships the Node-only deps npm audit flags', () => {
  it('sanity: the detection regex actually catches a real require (against the node build)', () => {
    // Proves the check below is not silently vacuous — if this ever fails, the
    // regex stopped matching real code, not just the browser build's comments.
    const { path } = findTransformersPkg()
    const nodeEntry = readFileSync(join(dirname(path), 'dist/transformers.node.cjs'), 'utf8')
    expect(requiresPackage(nodeEntry, 'onnxruntime-node')).toBe(true)
    expect(requiresPackage(nodeEntry, 'sharp')).toBe(true)
  })

  it("@huggingface/transformers still routes non-'node' resolution to a separate browser build", () => {
    const { path, json } = findTransformersPkg()
    const exportsMap = json.exports as Record<string, unknown> | undefined
    expect(
      exportsMap?.node,
      `${path}'s "exports" no longer has a "node" condition — the Node/browser split this ` +
        'check relies on may have been restructured. Re-verify by hand which build Vite resolves ' +
        'to before trusting this check again.',
    ).toBeDefined()
    const browserEntry = (exportsMap?.default as { default?: string } | undefined)?.default
    const nodeEntry = (exportsMap?.node as { default?: string; import?: { default?: string } } | undefined)
    const nodeEntryPath = nodeEntry?.import?.default ?? nodeEntry?.default
    expect(
      browserEntry,
      `${path}'s "exports" has no "default" condition's default entry — cannot tell which file ` +
        'a browser build resolves to.',
    ).toBeTruthy()
    expect(
      browserEntry,
      `${path} now resolves the same file for the "node" and default conditions (${browserEntry}) — ` +
        'the browser build and the Node build are no longer separate, so the Node-only deps npm audit ' +
        'flags may now ship in the bundle. This needs a real hand-verification (build the app, grep ' +
        'dist/ for onnxruntime-node/sharp), not a silent pass.',
    ).not.toBe(nodeEntryPath)
  })

  it('the resolved browser build of @huggingface/transformers does not require onnxruntime-node or sharp', () => {
    const { path, json } = findTransformersPkg()
    const exportsMap = json.exports as { default?: { default?: string } } | undefined
    const browserEntry = exportsMap?.default?.default
    if (!browserEntry) throw new Error('No browser entry found — see the previous test.')
    const src = readFileSync(join(dirname(path), browserEntry), 'utf8')
    for (const pkg of ['onnxruntime-node', 'sharp']) {
      expect(
        requiresPackage(src, pkg),
        `${browserEntry} now contains a real require/import of "${pkg}" — the Node-only dependency ` +
          "npm audit flags as high-severity would ship inside ai-local's bundled worker. This is the " +
          'exact case HANDOFF.md records as "checked, not shipped" — re-check by hand and either fix ' +
          'the import or accept the new exposure explicitly.',
      ).toBe(false)
    }
  })

  it('platform/ai-local/*.ts imports the bare specifier, not a Node-conditioned subpath', () => {
    const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'src/platform/ai-local')
      .split('\0')
      .filter((f) => f.endsWith('.ts'))
    const offenders: string[] = []
    for (const rel of files) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      if (/@huggingface\/transformers\/(node|dist\/transformers\.node)/.test(src)) offenders.push(rel)
    }
    expect(
      offenders,
      `${offenders.join(', ')} imports @huggingface/transformers via an explicit Node-build subpath — ` +
        'this forces the vulnerable onnxruntime-node/sharp dependency chain into the browser bundle. ' +
        "Import the bare '@huggingface/transformers' specifier and let Vite's own resolution pick the " +
        'browser build.',
    ).toEqual([])
  })
})
