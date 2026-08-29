/**
 * Layer rules for SoundGrid (v0.1.6).
 *
 * The architecture only holds if it is checked. `core/` is meant to be pure
 * TypeScript — no React, no DOM, no Web Audio, no Web MIDI — so that the deck
 * model, mapping and recommendation logic stay testable and survive the move to
 * a desktop shell. Nothing enforces that except this file.
 */
module.exports = {
  forbidden: [
    {
      name: 'core-stays-pure',
      severity: 'error',
      comment:
        'core/ must not depend on React or on any platform implementation. Put the ' +
        'platform-specific part behind a port in core/ports and implement it in platform/.',
      from: { path: '^src/core' },
      to: { path: '^(src/app|src/platform)|node_modules/(react|react-dom)' },
    },
    {
      name: 'core-no-components',
      severity: 'error',
      comment: 'core/ must not import a React component.',
      from: { path: '^src/core' },
      to: { path: '[.]tsx$' },
    },
    {
      name: 'platform-does-not-know-the-app',
      // Known outstanding: transport-webmidi/manager.ts writes to the store and
      // calls controls.ts directly. It should emit ControlActions through the
      // ControlTransport port and let controls.ts wire them. Warning until then
      // so it stays visible rather than quietly becoming the norm.
      severity: 'warn',
      comment: 'platform/ should expose a port, not reach into the app layer.',
      from: { path: '^src/platform' },
      to: { path: '^src/app' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependency.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js'] },
  },
}
