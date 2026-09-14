import { describe, expect, it } from 'vitest'
import { read } from './repo.ts'

/**
 * v0.8.7 added a real `LICENSE` file and a `license` field in `package.json`
 * — before this, "MIT" was only a sentence in a spec, not a fact a build
 * tool or a downstream user could read. The two have to name the same
 * license or one of them is lying.
 */
describe('the declared license is the license', () => {
  it('LICENSE exists and is the MIT license', () => {
    const license = read('LICENSE')
    expect(license.includes('MIT License'), 'LICENSE does not contain "MIT License".').toBe(true)
    expect(
      license.includes('Permission is hereby granted'),
      'LICENSE does not contain the standard MIT grant text — is this actually the MIT license?',
    ).toBe(true)
  })

  it('package.json declares "MIT", matching LICENSE', () => {
    const pkg = JSON.parse(read('package.json')) as { license?: string }
    expect(
      pkg.license,
      'package.json has no "license" field, but LICENSE says MIT. Add "license": "MIT".',
    ).toBe('MIT')
  })
})
