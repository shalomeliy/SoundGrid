/**
 * One-time migration (v0.4.0): re-keys the v0.3.2 path-keyed genre overrides
 * under content hash, in `genre-overrides-idb/store.ts`'s new `HASH_KEY`
 * store. Non-destructive — Risk 3 in `workshop-output/PLAN.md`'s own stated
 * rollback: this only ever reads the old store, never writes or deletes it,
 * so a bad migration can be re-run (once the guard flag below is cleared)
 * without losing the original data.
 *
 * Only migrates entries whose path still matches a track in *this* scan — a
 * file that already moved before this runs has nothing here to key its old
 * override to, and stays exactly the known, accepted debt named in
 * `HANDOFF.md`'s "עריכת ז'אנר ידנית אובדת בשקט" line. What this fixes is
 * forward-looking: an override still correctly matched today survives every
 * move from here on, because it now travels by content, not path.
 */
import { get, set } from 'idb-keyval'
import { getGenreOverrides, setGenreOverrideByHash } from '@/platform/genre-overrides-idb/store'
import { hashFile } from '@/platform/source-fsaccess/hash'
import type { Track } from '@/core/types'

const MIGRATED_KEY = 'soundgrid:genreOverrides:migratedToHash'

/**
 * Runs once per browser profile, guarded by `MIGRATED_KEY` — every later
 * scan is a no-op read of that flag, not a re-walk of the override map.
 * Call with the tracks from a completed scan, so `track.handle` is real and
 * a hash can actually be computed.
 */
export async function migrateGenreOverridesToHash(tracks: Track[]): Promise<void> {
  if (await get<boolean>(MIGRATED_KEY)) return
  const overrides = await getGenreOverrides()
  if (overrides.size === 0) {
    await set(MIGRATED_KEY, true)
    return
  }
  const byId = new Map(tracks.map((t) => [t.id, t]))
  for (const [trackId, genre] of overrides) {
    const track = byId.get(trackId)
    if (!track) continue // no current track at that path — nothing to re-key
    try {
      const hash = await hashFile(track.handle)
      await setGenreOverrideByHash(hash, genre)
    } catch {
      // File vanished or became unreadable between the scan and here — best
      // effort per entry, the same "one bad file never stalls the rest"
      // rule the analysis queue follows.
    }
  }
  await set(MIGRATED_KEY, true)
}
