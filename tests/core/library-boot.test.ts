import { describe, expect, it } from 'vitest'
import {
  bootCopy,
  bootFor,
  bootForScanError,
  type LibraryBoot,
  type SavedPermission,
} from '@/core/library-boot'

/**
 * v0.2.6. These hold the three startup situations apart, and the reason they
 * exist is that the app could not tell them apart at all: `restoreLibraryFolder`
 * queried the permission and returned the same object either way, so a folder
 * that was one click from opening and a folder that was already open looked
 * identical from the outside.
 */
describe('bootFor', () => {
  it('scans unattended only when the saved permission is still granted', () => {
    expect(bootFor(true, { kind: 'saved', permission: 'granted' })).toBe('restoring')
  })

  /**
   * The whole point. Chromium's "Allow this time" does not come back as
   * `denied` on the next load — it comes back as `prompt`, exactly like a
   * handle that was never granted. Treating that as `denied` would tell the
   * user they are blocked when they are one click away; treating it as
   * `granted` would scan and fail with nothing on screen.
   */
  it('treats a reverted permission as one click away, not as a refusal', () => {
    expect(bootFor(true, { kind: 'saved', permission: 'prompt' })).toBe('needs-click')
    expect(bootFor(true, { kind: 'saved', permission: 'denied' })).toBe('blocked')
    expect(bootFor(true, { kind: 'saved', permission: 'prompt' })).not.toBe(
      bootFor(true, { kind: 'saved', permission: 'denied' }),
    )
  })

  it('has a first-visit state distinct from every saved-folder state', () => {
    expect(bootFor(true, { kind: 'none' })).toBe('new')
    const saved: SavedPermission[] = ['granted', 'prompt', 'denied']
    for (const permission of saved) {
      expect(bootFor(true, { kind: 'saved', permission })).not.toBe('new')
    }
  })

  /**
   * A record that survived in IndexedDB but is not a handle this build can use.
   * Falling back to 'new' here would tell the user nothing is saved while a
   * folder plainly is — the remembered-but-denied confusion again, one level up.
   */
  it('separates an unusable saved record from no record at all', () => {
    expect(bootFor(true, { kind: 'unusable' })).toBe('unusable')
    expect(bootFor(true, { kind: 'unusable' })).not.toBe(bootFor(true, { kind: 'none' }))
  })

  it('reports an unsupported browser before anything else', () => {
    expect(bootFor(false, { kind: 'none' })).toBe('unsupported')
    expect(bootFor(false, { kind: 'saved', permission: 'granted' })).toBe('unsupported')
  })
})

describe('bootForScanError', () => {
  it('names a folder that moved instead of showing an empty list', () => {
    expect(bootForScanError('NotFoundError')).toBe('missing')
  })

  it('routes permission lost mid-scan back to the blocked path', () => {
    expect(bootForScanError('NotAllowedError')).toBe('blocked')
    expect(bootForScanError('SecurityError')).toBe('blocked')
  })

  it('keeps an unrecognised failure visible rather than swallowing it', () => {
    expect(bootForScanError('TypeError')).toBe('failed')
    expect(bootForScanError('')).toBe('failed')
  })
})

const ALL: LibraryBoot[] = [
  'checking',
  'unsupported',
  'new',
  'unusable',
  'restoring',
  'needs-click',
  'blocked',
  'missing',
  'failed',
  'loaded',
]

describe('bootCopy', () => {
  /**
   * The project's central rule, applied to startup: the one thing the library
   * panel may never do is sit empty with nothing explaining why. `loaded` is
   * the single state with no sentence, because there are tracks on screen.
   */
  it('gives every state except loaded something to say', () => {
    for (const boot of ALL) {
      const copy = bootCopy(boot, 'Tracks')
      if (boot === 'loaded') {
        expect(copy).toBeNull()
        continue
      }
      expect(copy, boot).not.toBeNull()
      expect(copy!.title.length, boot).toBeGreaterThan(0)
      expect(copy!.body.length, boot).toBeGreaterThan(0)
    }
  })

  /**
   * "Tracks is no longer there" is actionable; "the folder is missing" is not.
   * Same reason the skipped badge names the extensions instead of counting to
   * itself.
   */
  it('names the folder in every state that is about that folder', () => {
    for (const boot of ['restoring', 'needs-click', 'blocked', 'missing', 'failed'] as const) {
      expect(bootCopy(boot, 'Tracks')!.title, boot).toContain('Tracks')
    }
  })

  it('still reads as a sentence when the folder name was never saved', () => {
    for (const boot of ALL) {
      const copy = bootCopy(boot, null)
      if (copy) expect(copy.title, boot).not.toContain('null')
    }
  })

  it('offers a way out of every state the user can act on', () => {
    for (const boot of ['new', 'needs-click', 'blocked', 'missing', 'failed'] as const) {
      expect(bootCopy(boot, 'Tracks')!.cta, boot).toBeTruthy()
    }
    // nothing to click while a read is in flight, or when the browser cannot do it at all
    expect(bootCopy('checking', 'Tracks')!.cta).toBeUndefined()
    expect(bootCopy('restoring', 'Tracks')!.cta).toBeUndefined()
    expect(bootCopy('unsupported', null)!.cta).toBeUndefined()
  })

  it('quotes the browser when a scan fails for a reason we did not anticipate', () => {
    expect(bootCopy('failed', 'Tracks', 'the disk went away')!.body).toContain(
      'the disk went away',
    )
    // and still says something when the browser gave no message at all
    expect(bootCopy('failed', 'Tracks')!.body.length).toBeGreaterThan(0)
  })
})
