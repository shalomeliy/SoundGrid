/**
 * Durable key/value storage. IndexedDB today (`platform/persist-idb`); the
 * desktop build will back this with the filesystem instead. Cue points, saved
 * loops and the analysis cache all land here from v0.4 on.
 */
export interface Persistence {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
}
