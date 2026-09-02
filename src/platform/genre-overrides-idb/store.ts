/**
 * Manual genre overrides (v0.3.2), keyed by track id, on `idb-keyval`.
 *
 * A small dedicated store rather than a `core/ports/persistence.ts` implementation:
 * that port's own doc comment names cue points/loops/the analysis cache as its v0.4
 * consumers, and building it out now would jump ahead of the work it was actually
 * designed for. This mirrors `settings-idb/store.ts`'s shape instead — one key, one
 * plain object, failures caught and reported to the caller rather than swallowed.
 */
import { get, set } from 'idb-keyval'

const KEY = 'soundgrid:genreOverrides'

/**
 * All stored overrides, `trackId -> genre`. Returns an empty map (never throws)
 * on a read failure — a missing IndexedDB must not stop the library from
 * loading, only stop overrides from being remembered.
 */
export async function getGenreOverrides(): Promise<Map<string, string>> {
  try {
    const stored = await get<Record<string, string>>(KEY)
    return new Map(Object.entries(stored ?? {}))
  } catch {
    return new Map()
  }
}

/**
 * Persist one override. Throws on failure so the caller — `controls.ts`, the
 * one place user actions are dispatched from — can decide how to surface it;
 * swallowing it here would mean an edit that looks saved but silently is not.
 */
export async function setGenreOverride(trackId: string, genre: string): Promise<void> {
  const stored = await get<Record<string, string>>(KEY)
  await set(KEY, { ...(stored ?? {}), [trackId]: genre })
}
