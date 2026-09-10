/**
 * v0.6.0 post-close bug: a saved sampler bank silently failed to restore on
 * a real page reload — "the samples I dragged to the pads disappeared"
 * (Shalom, real usage against a real library). Run against `npm run dev` on
 * :5173:
 *
 *   node scripts/verify-sampler-restore.mjs
 *
 * Two compounding bugs, found by tracing `controls.ts`/`Library.tsx` and
 * confirmed here against the real store + real sampler engine (not a mock):
 *
 * Bug A — `restoreSamplerBankMeta()` (loads the saved bank's `contentHash`/
 * mode/gain from IndexedDB into `sampler.slots`) only ever ran from inside
 * `initAudio()`, which needs a user gesture. Library.tsx's boot-time folder
 * restore runs unattended — no gesture — and used to call
 * `resolveSamplerSlots()` before the saved bank had ever been loaded, so
 * every slot's `contentHash` was still empty and nothing could match.
 * Fixed: `restoreSamplerBankMeta` is now idempotent and called from
 * `resolveSamplerSlots()` itself.
 *
 * Bug B — even with Bug A fixed, `resolveSamplerSlots()` was called too
 * early in `runScan`/`addFiles`: a track's own `contentHash` is filled in
 * lazily by the analysis pass (`core/types.ts`), not at scan time, so on a
 * REAL scan no track has one yet at that point either — the call could
 * never have matched anything, independent of Bug A. v0.6.0's own closing
 * verification (`docs/handoff/v0.6.0.md`) never caught this because it
 * injected an ALREADY-hashed track directly into `library.tracks` before
 * calling `resolveSamplerSlots()`, which skips past exactly this ordering.
 * Fixed: `runScan`/`addFiles` now call `resolveSamplerSlots()` again after
 * tagging + analysis (the `Promise.all` that actually produces hashes)
 * settles.
 *
 * This script calls the same public functions Library.tsx calls
 * (`ctl.resolveSamplerSlots()`), through the live page's own module graph
 * (Vite dev server serves every source file as a real ES module at its
 * /src/... path, `@/` aliases resolved) — same store, same sampler engine
 * singleton the rendered app uses. Track injection stands in for a real
 * `scanLibrary()`/analysis pass, matching the pattern v0.6.0's own
 * verification used (see the doc comment above) but exercising both calls
 * in the real two-phase order instead of pre-hashing the track upfront.
 */
import { chromium } from 'playwright'

const URL = 'http://localhost:5173/'
const results = []
const ok = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function makeWav() {
  const sr = 8000
  const n = Math.floor(sr * 0.05) // 0.05s, mono, 16-bit PCM — small and valid
  const buf = new ArrayBuffer(44 + n * 2)
  const dv = new DataView(buf)
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true)
  dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true)
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  writeStr(36, 'data'); dv.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    dv.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 0.3 * 32767), true)
  }
  return buf
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)))
await page.goto(URL)
await page.waitForTimeout(500)

// Seed IndexedDB with a saved sampler bank via the app's OWN saveSamplerBank
// + hashBytes, so the format matches a real export/save exactly.
const wavBytesB64Outer = Buffer.from(makeWav()).toString('base64')
const seed = await page.evaluate(async (wavBytesB64) => {
  const { saveSamplerBank } = await import('/src/platform/sampler-idb/store.ts')
  const { hashBytes } = await import('/src/platform/source-fsaccess/hash.ts')
  const bytes = Uint8Array.from(atob(wavBytesB64), (c) => c.charCodeAt(0))
  const hash = await hashBytes(bytes.buffer)
  await saveSamplerBank([
    { contentHash: hash, trackName: 'Race-condition test tone', bpm: 128, mode: 'oneShot', gain: 0.8, syncEnabled: false },
    ...Array(15).fill(null),
  ])
  return { hash, wavBytesB64 }
}, wavBytesB64Outer)

// A genuinely cold reload — fresh module graph, fresh store, zero clicks
// anywhere on the page. This is the exact moment the old code broke.
await page.reload()
await page.waitForTimeout(500)

const r = await page.evaluate(async ({ hash, wavBytesB64 }) => {
  const { useStore } = await import('/src/app/state/store.ts')
  const ctl = await import('/src/controls.ts')
  const bytes = Uint8Array.from(atob(wavBytesB64), (c) => c.charCodeAt(0))
  const file = new File([bytes], 'race-test.wav', { type: 'audio/wav' })
  const track = { id: 'race-test', name: 'race-test.wav', path: 'race-test.wav', kind: 'wav', handle: { getFile: async () => file } }

  // Phase 1: exactly what scanLibrary's fast synchronous pass hands
  // resolveSamplerSlots the FIRST time runScan calls it — no contentHash yet.
  useStore.getState().setLibrary({ tracks: [track] })
  await ctl.resolveSamplerSlots()
  await new Promise((res) => setTimeout(res, 200))
  const afterFirstCall = { ...useStore.getState().sampler.slots[0] }

  // Phase 2: the analysis queue has now hashed the file — what
  // applyAnalysisQueue's per-track patch really produces — and runScan
  // calls resolveSamplerSlots() again once that queue settles.
  useStore.getState().setLibrary({
    tracks: useStore.getState().library.tracks.map((t) => (t.id === 'race-test' ? { ...t, contentHash: hash } : t)),
  })
  await ctl.resolveSamplerSlots()
  await new Promise((res) => setTimeout(res, 300))
  const afterSecondCall = { ...useStore.getState().sampler.slots[0] }

  return { afterFirstCall, afterSecondCall, expectedHash: hash }
}, seed)

ok('Bug A fixed: metadata (name/mode/gain) restores before any track is hashed, no gesture needed',
  r.afterFirstCall.contentHash === r.expectedHash && r.afterFirstCall.trackName === 'Race-condition test tone')
ok('first call correctly does NOT resolve a real trackId yet (proves the 2nd call is load-bearing)',
  r.afterFirstCall.trackId == null)
ok('Bug B fixed: once the track is hashed, the follow-up resolveSamplerSlots() call resolves it for real',
  r.afterSecondCall.trackId === 'race-test' && r.afterSecondCall.mode === 'oneShot')

await browser.close()
const passed = results.filter((x) => x.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
