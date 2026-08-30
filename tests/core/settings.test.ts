import { describe, expect, it } from 'vitest'
import {
  DEFAULTS,
  FIELDS,
  FIELD_BY_KEY,
  coerce,
  migrate,
  secPerRev,
} from '@/core/settings.ts'
import { PLATTER_RPM } from '@/core/constants.ts'
import { SEC_PER_REV } from '@/core/scratch.ts'

describe('the schema and its defaults', () => {
  it('gives every field a default', () => {
    for (const f of FIELDS) expect(DEFAULTS[f.key], `${f.key} has no default`).toBeDefined()
  })

  it('keeps every numeric default inside the range its own control offers', () => {
    // The failure this catches: a default tuned in constants.ts and a range
    // typed here, drifting apart. The screen would then open showing a value
    // its slider cannot reach, and the first touch of that slider would move
    // the setting without the user asking for a change.
    for (const f of FIELDS) {
      if (f.kind !== 'number') continue
      const v = DEFAULTS[f.key] as number
      expect(v, `${f.key} default ${v} is below min ${f.min}`).toBeGreaterThanOrEqual(f.min)
      expect(v, `${f.key} default ${v} is above max ${f.max}`).toBeLessThanOrEqual(f.max)
    }
  })

  it('offers every choice default as one of its own options', () => {
    for (const f of FIELDS) {
      if (f.kind !== 'choice') continue
      expect(
        f.options.map((o) => o.value),
        `${f.key} default is not among its options`,
      ).toContain(DEFAULTS[f.key])
    }
  })

  it('describes each field exactly once', () => {
    expect(FIELD_BY_KEY.size).toBe(FIELDS.length)
  })

  it('gives each field a help line that is not its own label again', () => {
    // "Which decision of the user's is this?" is the version's own admission
    // test for a field, and a help line that restates the label is the shape a
    // field takes when it has no answer. Cheap to check, and it is the check
    // that keeps the screen from filling up with settings nobody asked for.
    for (const f of FIELDS) {
      expect(f.help.length, `${f.key} has no help line`).toBeGreaterThan(10)
      expect(f.help.toLowerCase(), `${f.key} explains itself with its own name`).not.toBe(
        f.label.toLowerCase(),
      )
    }
  })

  it('states a version for every field whose data does not exist yet', () => {
    // A `pending` note is the honest alternative to hiding a control that
    // cannot work yet. A note that does not say *when* is just an apology.
    for (const f of FIELDS) {
      if (!f.pending) continue
      expect(f.pending, `${f.key} is pending but names no version`).toMatch(/v\d+\.\d+/)
    }
  })
})

describe('coerce', () => {
  it('returns the defaults, and no complaints, for an empty store', () => {
    const { values, issues } = coerce(undefined)
    expect(values).toEqual(DEFAULTS)
    expect(issues).toEqual([])
  })

  it('survives a store that is not an object at all', () => {
    // A DJ mid-set cannot repair a schema. Corrupt data must boot.
    expect(coerce('nonsense').values).toEqual(DEFAULTS)
    expect(coerce(42).values).toEqual(DEFAULTS)
    expect(coerce(null).values).toEqual(DEFAULTS)
  })

  it('keeps a valid stored value', () => {
    const { values, issues } = coerce({ bendPerTick: 0.2, lockPlayingDeck: false })
    expect(values.bendPerTick).toBe(0.2)
    expect(values.lockPlayingDeck).toBe(false)
    expect(issues).toEqual([])
  })

  it('clamps an out-of-range number and says so', () => {
    // Clamped, not defaulted: 900 past a max of 0.5 still says "as high as
    // possible", and throwing that away loses the user's intent as well as
    // their number.
    const { values, issues } = coerce({ bendPerTick: 900 })
    expect(values.bendPerTick).toBe(0.5)
    expect(issues).toEqual([
      { key: 'bendPerTick', got: '900', used: '0.5', reason: 'out-of-range' },
    ])
  })

  it('reports a wrong type rather than coercing it', () => {
    const { values, issues } = coerce({ bendPerTick: '0.2' })
    expect(values.bendPerTick).toBe(DEFAULTS.bendPerTick)
    expect(issues[0]).toMatchObject({ key: 'bendPerTick', reason: 'wrong-type' })
  })

  it('rejects NaN and Infinity, which are numbers and are not values', () => {
    expect(coerce({ eqDb: Number.NaN }).values.eqDb).toBe(DEFAULTS.eqDb)
    expect(coerce({ eqDb: Number.POSITIVE_INFINITY }).issues[0].reason).toBe('wrong-type')
  })

  it('refuses a choice that is not on the menu', () => {
    const { values, issues } = coerce({ tempoRange: 0.25 })
    expect(values.tempoRange).toBe(DEFAULTS.tempoRange)
    expect(issues[0]).toMatchObject({ key: 'tempoRange', reason: 'not-an-option' })
  })

  it('names a key it no longer knows instead of dropping it in silence', () => {
    // The project's central rule, applied to the settings file: a preference
    // that stopped being read is a thing the user has to be able to find out.
    const { issues } = coerce({ platterSize: 54 })
    expect(issues).toEqual([
      { key: 'platterSize', got: '54', used: '(ignored)', reason: 'unknown-key' },
    ])
  })

  it('ignores the version marker without calling it an unknown key', () => {
    expect(coerce({ version: 1 }).issues).toEqual([])
  })

  it('accepts null for the output device, and only null or a string', () => {
    expect(coerce({ outputDeviceId: null }).values.outputDeviceId).toBeNull()
    expect(coerce({ outputDeviceId: 'abc' }).values.outputDeviceId).toBe('abc')
    expect(coerce({ outputDeviceId: 7 }).issues[0]).toMatchObject({ reason: 'wrong-type' })
  })

  it('keeps the good fields when one field is bad', () => {
    const { values, issues } = coerce({ bendPerTick: 'bad', eqDb: 30 })
    expect(values.eqDb).toBe(30)
    expect(issues).toHaveLength(1)
  })
})

describe('migrate', () => {
  it('carries the old localStorage key mode into the schema', () => {
    const r = migrate(undefined, { keyMode: 'camelot' })
    expect(r.values.keyMode).toBe('camelot')
    expect(r.migrated).toEqual(['keyMode'])
  })

  it('lets a value set in the new screen beat the stale old key', () => {
    // Without this the legacy entry — still sitting in localStorage, written by
    // the library table — would reach back in and undo the user's choice on
    // every reload, and the setting would look like it does not save.
    const r = migrate({ keyMode: 'musical' }, { keyMode: 'camelot' })
    expect(r.values.keyMode).toBe('musical')
    expect(r.migrated).toEqual([])
  })

  it('ignores a legacy value that means nothing', () => {
    const r = migrate(undefined, { keyMode: 'klingon' })
    expect(r.values.keyMode).toBe(DEFAULTS.keyMode)
    expect(r.migrated).toEqual([])
  })

  it('reports nothing migrated when there was nothing to migrate', () => {
    expect(migrate(undefined, {}).migrated).toEqual([])
  })

  it('still reports the issues coerce found', () => {
    expect(migrate({ eqDb: 999 }, {}).issues[0].reason).toBe('out-of-range')
  })
})

describe('platter speed', () => {
  it('converts RPM to seconds of audio per revolution', () => {
    expect(secPerRev(45)).toBeCloseTo(1.333, 3)
    expect(secPerRev(33.333)).toBeCloseTo(1.8, 3)
  })

  it('defaults to the speed the scratch maths already used', () => {
    // 45, not the tidier 33⅓: SEC_PER_REV shipped at 1.333s, and a "cleaner"
    // default would have quietly changed how every existing scratch feels.
    expect(secPerRev(PLATTER_RPM)).toBeCloseTo(SEC_PER_REV, 3)
  })
})
