/**
 * v0.8.5 M3 step 3 verification. Run against `npm run dev` on :5173:
 *
 *   node scripts/verify-embedding-backfill.mjs
 *
 * `queueEmbeddingBackfill` (platform/source-fsaccess/library.ts) is the pass
 * that catches up tracks analyzed before v0.8.5 existed — this seeds one
 * such track directly into the store (`analysisState: 'analyzed'`, a real
 * `contentHash`, no `embedding`, a fake `handle` serving a real synthetic
 * WAV) and calls the function directly, without going through a folder scan
 * — isolates this one pass from `queueLibraryAnalysis`, which already has
 * its own verification (`verify-embedding-cache-hit.mjs`).
 */
import { chromium } from 'playwright'

const URL = 'http://localhost:5173/'
const VIEWPORT = { width: 1536, height: 710 }
const results = []
const ok = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function makeWav(durationSec, sampleRate) {
  const numSamples = Math.round(durationSec * sampleRate)
  const dataSize = numSamples * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  const writeStr = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  const view16 = new Int16Array(buf, 44)
  for (let i = 0; i < numSamples; i++) {
    view16[i] = Math.round(3000 * Math.sin((2 * Math.PI * 2 * i) / sampleRate))
  }
  return Buffer.from(buf)
}

const WAV_BASE64 = makeWav(45, 8000).toString('base64')

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const page = await browser.newPage({ viewport: VIEWPORT })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(300)

const result = await page.evaluate(async (wavBase64) => {
  const { useStore } = await import('/src/app/state/store.ts')
  const { queueEmbeddingBackfill } = await import('/src/platform/source-fsaccess/library.ts')

  const bytes = Uint8Array.from(atob(wavBase64), (c) => c.charCodeAt(0))
  const oldTrack = {
    id: 'old-track',
    name: 'old-track',
    path: 'old-track.wav',
    kind: 'audio/wav',
    handle: { getFile: async () => new File([bytes], 'old-track.wav', { type: 'audio/wav' }) },
    contentHash: 'fake-hash-of-old-track',
    analysisState: 'analyzed',
    bpm: 128,
    durationSec: 45,
    // no `embedding` — this is the "analyzed before v0.8.5" scenario.
  }
  useStore.getState().setLibrary({ tracks: [oldTrack] })

  const events = []
  await queueEmbeddingBackfill(
    [oldTrack],
    (patch, progress) => {
      events.push({ patch: Object.fromEntries(patch), progress })
      const store = useStore.getState()
      store.setLibrary({
        tracks: store.library.tracks.map((t) => {
          const p = patch.get(t.id)
          return p ? { ...t, ...p } : t
        }),
      })
    },
    { concurrency: 1 },
  )

  const finalTrack = useStore.getState().library.tracks.find((t) => t.id === 'old-track')
  return {
    events,
    hasEmbedding: !!finalTrack?.embedding && finalTrack.embedding.length > 0,
    embeddingState: finalTrack?.embeddingState,
  }
}, WAV_BASE64)

ok('backfill: at least one \'embedding\' progress event fired', result.events.some((e) => e.patch['old-track']?.embeddingState === 'embedding'), JSON.stringify(result.events.map((e) => e.patch)))
ok('backfill: track ends up with a real embedding', result.hasEmbedding === true, JSON.stringify(result))
ok('backfill: embeddingState settles to embedded', result.embeddingState === 'embedded', result.embeddingState)
ok('no console errors', errors.length === 0, errors[0])

await browser.close()
const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
