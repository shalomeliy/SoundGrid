import { useSyncExternalStore } from 'react'
import { settings } from '@/platform/settings-idb/store'
import type { Settings } from '@/core/settings'

/**
 * React's view of the settings port.
 *
 * `useSyncExternalStore`, not a `useState` + `useEffect` pair: the store is
 * already the source of truth and already publishes changes, so mirroring it
 * into component state would create a second copy that can lag behind the audio
 * path by a render. A setting the engine has applied and the screen has not is
 * indistinguishable, to the user, from a setting that did not save.
 *
 * `settings.values` keeps its identity between writes, so the snapshot is
 * referentially stable and this does not re-render on unrelated updates.
 */
export function useSettings(): Settings {
  return useSyncExternalStore(
    (fn) => settings.subscribe(fn),
    () => settings.values,
  )
}
