/**
 * Bumps when the *extraction logic* for a given `modelId` changes meaningfully
 * (e.g. `embed-classical/analyze.ts`'s frame size, hop size, or coefficient
 * count changes) — not when the model itself changes, which is what
 * `modelId` already distinguishes. Mirrors `analyze-cache-idb/version.ts`'s
 * `ANALYZER_VERSION` reasoning: a stale entry is a silent-skip risk, so this
 * is a deliberate manual step, named here.
 */
export const EMBEDDER_VERSION = 1
