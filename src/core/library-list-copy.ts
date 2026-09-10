/**
 * What the library table's empty state says once tracks ARE loaded — as
 * opposed to `library-boot.ts`, which covers the panel before anyone has
 * clicked anything.
 *
 * The bug this exists to prevent: an empty table and a header still reading
 * "43 tracks · 34 with BPM" look identical whether the folder genuinely has
 * no readable audio, or `filteredTracks()` narrowed a real library down to
 * nothing (Mix Assist's `mixOnly`, or a text filter). Collapsing those into
 * one "No audio files found" message is exactly the silent skip this
 * project forbids: the message would say the folder has no music when it
 * has 43 tracks and a filter is just hiding them. Pure on purpose — no
 * store, no React — so the three cases are the part worth testing.
 */
export interface LibraryEmptyCopy {
  title: string
  body: string
  /** true when a "Show all tracks" action can resolve this by itself */
  offerMixOnlyReset: boolean
}

export function libraryEmptyCopy(
  query: string,
  mixOnly: boolean,
  /** length of `filteredTracks()` BEFORE the mixOnly narrowing — i.e. what
   * the text filter alone leaves (it already applied `query`, if any).
   * Distinguishes "mixOnly hid a real, filter-matched library" from "there
   * was never anything here [to match]". Checked before `query` below on
   * purpose: a query that matched real tracks, all subsequently hidden by
   * mixOnly, is mixOnly's doing — telling the owner to "clear the filter"
   * would be true but useless, since clearing it alone would not bring
   * anything back. */
  preMixCount: number,
): LibraryEmptyCopy {
  if (mixOnly && preMixCount > 0) {
    return {
      title: 'No tracks currently mix with what’s playing',
      body: 'Turn off Mix Only to see the whole library again.',
      offerMixOnlyReset: true,
    }
  }
  if (query) {
    return {
      title: 'No tracks match that filter',
      body: 'Clear the filter to see the whole library.',
      offerMixOnlyReset: false,
    }
  }
  return {
    title: 'No audio files found',
    body: 'This folder has no readable .mp3, .wav, .flac, .ogg or .m4a files.',
    offerMixOnlyReset: false,
  }
}
