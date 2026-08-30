/**
 * User settings, as the rest of the app is allowed to see them.
 *
 * `idb-keyval` behind it today; the desktop build will write a real file
 * instead, and nothing outside `platform/` should have to care.
 *
 * **Read `values` into a local, re-read it in `subscribe`.** `controls.ts`
 * handles ~670 jog messages a second, and a store lookup per message is the
 * same mistake the jog indicator already made once — the fix there was to stop
 * doing per-tick work, and this port is shaped so the fix is the obvious way to
 * use it rather than a thing to remember.
 */
import type { Settings, SettingsIssue } from '@/core/settings'

export interface SettingsStore {
  /** The current values. Stable object identity between writes. */
  readonly values: Settings
  /**
   * What was wrong in the stored data at load, and what is being used instead.
   * Empty on a clean load. Surfaced on the Settings screen — a repair the user
   * never sees is the silent skip this project forbids.
   */
  readonly issues: SettingsIssue[]
  /** Legacy keys carried into the schema on first run, for the same report. */
  readonly migrated: string[]
  /** Load from storage, migrating older keys. Safe to call once at boot. */
  init(): Promise<void>
  set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>
  /** Restore one field to its built-in default. */
  reset<K extends keyof Settings>(key: K): Promise<void>
  /** Called after every change, with the new values. Returns an unsubscribe. */
  subscribe(fn: (values: Settings) => void): () => void
}
