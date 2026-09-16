/**
 * v0.8.5 M3 step 4/5 verification (`workshop-output/PLAN.md` §14). Run
 * against `npm run dev` on :5173:
 *
 *   node scripts/verify-similarity-ui.mjs
 *
 * Task 4/5 only wire the UI on top of pieces M3 steps 1-3 already verified
 * (`verify-embedding-cache-hit.mjs`, `verify-embedding-backfill.mjs`) — so
 * this seeds the store directly with tracks in each state the UI must
 * distinguish (missing embedding / has embedding) rather than re-running a
 * real scan or backfill, and drives the real DOM: the header badge
 * appearing/disappearing as `embeddingBackfillTotal` changes, the per-row
 * "find similar" button's enabled/disabled + title, the chip appearing on
 * click and narrowing the list, and the chip's "×" restoring it.
 */
import { chromium } from 'playwright'

const URL = 'http://localhost:5173/'
const VIEWPORT = { width: 1536, height: 710 }
const results = []
const ok = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined })
const page = await browser.newPage({ viewport: VIEWPORT })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(300)

// --- seed: one track still pending backfill (analyzed, no embedding), plus
// a seed track + a close match + a far track, all already embedded. ---
await page.evaluate(async () => {
  const { useStore } = await import('/src/app/state/store.ts')
  const fakeHandle = (name) => ({ getFile: async () => new File([], name) })
  const vec = (...xs) => Float32Array.from(xs)

  const tracks = [
    {
      id: 'pending',
      name: 'Pending Track',
      title: 'Pending Track',
      path: 'Pending Track.wav',
      kind: 'audio/wav',
      handle: fakeHandle('pending.wav'),
      contentHash: 'hash-pending',
      analysisState: 'analyzed',
      // no embedding, no embeddingState — this is the "still queued for
      // backfill" case the header badge counts.
    },
    {
      id: 'seed',
      name: 'Seed Track',
      title: 'Seed Track',
      path: 'Seed Track.wav',
      kind: 'audio/wav',
      handle: fakeHandle('seed.wav'),
      contentHash: 'hash-seed',
      analysisState: 'analyzed',
      embeddingState: 'embedded',
      embedding: vec(1, 0, 0, 0, 0),
    },
    {
      id: 'close',
      name: 'Close Match',
      title: 'Close Match',
      path: 'Close Match.wav',
      kind: 'audio/wav',
      handle: fakeHandle('close.wav'),
      contentHash: 'hash-close',
      analysisState: 'analyzed',
      embeddingState: 'embedded',
      embedding: vec(0.95, 0.05, 0, 0, 0),
    },
    {
      id: 'far',
      name: 'Far Track',
      title: 'Far Track',
      path: 'Far Track.wav',
      kind: 'audio/wav',
      handle: fakeHandle('far.wav'),
      contentHash: 'hash-far',
      analysisState: 'analyzed',
      embeddingState: 'embedded',
      embedding: vec(0, 0, 0, 0, 1),
    },
    {
      id: 'failed',
      name: 'Failed Track',
      title: 'Failed Track',
      path: 'Failed Track.wav',
      kind: 'audio/wav',
      handle: fakeHandle('failed.wav'),
      contentHash: 'hash-failed',
      analysisState: 'analyzed',
      embeddingState: 'failed',
      embeddingError: 'decode error (synthetic)',
    },
  ]
  useStore.getState().setLibrary({ tracks, boot: 'loaded', scanning: false })
})
await page.waitForTimeout(200)

// 1. Badge shows exactly the one pending track (failed/embedded don't count).
const badge = await page.locator('text=/\\d+ analyzing for similarity/').first()
ok('badge shows 1 analyzing for similarity', (await badge.textContent())?.trim() === '1 analyzing for similarity', await badge.textContent().catch(() => null))

// 2. Pending row's similar-button is disabled with the right title; failed
// row's explains the failure instead of looking identical to "not run yet".
const row = (name) => page.locator('tbody tr', { hasText: name })
const pendingBtn = row('Pending Track').getByRole('button', { name: 'Find similar tracks' })
ok('pending row: similar button disabled', await pendingBtn.isDisabled())
ok('pending row: title says not yet analyzed', ((await pendingBtn.getAttribute('title')) ?? '').includes('Not yet analyzed'), await pendingBtn.getAttribute('title'))
const failedBtn = row('Failed Track').getByRole('button', { name: 'Find similar tracks' })
ok('failed row: similar button disabled', await failedBtn.isDisabled())
ok('failed row: title surfaces the error, not silently identical to pending', ((await failedBtn.getAttribute('title')) ?? '').includes('decode error'), await failedBtn.getAttribute('title'))

// 3. Backfill "completes": patch the pending track with an embedding — badge
// must disappear (same store shape `applyEmbeddingBackfill`'s onUpdate uses).
await page.evaluate(async () => {
  const { useStore } = await import('/src/app/state/store.ts')
  const store = useStore.getState()
  store.setLibrary({
    tracks: store.library.tracks.map((t) =>
      t.id === 'pending' ? { ...t, embedding: Float32Array.from([0, 1, 0, 0, 0]), embeddingState: 'embedded' } : t,
    ),
  })
})
await page.waitForTimeout(100)
const badgeGone = await page.locator('text=/\\d+ analyzing for similarity/').count()
ok('badge disappears once backfill patch lands', badgeGone === 0, `count=${badgeGone}`)

// 4. Click "find similar" on the seed track (now enabled) → chip appears,
// list narrows to seed's own matches (close should rank above far).
const seedBtn = row('Seed Track').getByRole('button', { name: 'Find similar tracks' })
ok('seed row: similar button enabled once embedded', await seedBtn.isEnabled())
await seedBtn.click()
await page.waitForTimeout(100)
const chip = page.locator('button', { hasText: 'Similar to: Seed Track' })
ok('chip appears after clicking find-similar', (await chip.count()) > 0)
const visibleTitles = await page.locator('tbody tr td:first-child span.truncate').allTextContents()
ok(
  'list narrows to matches, ranked closest first (Close before Far, Seed itself excluded)',
  visibleTitles.indexOf('Close Match') !== -1 &&
    visibleTitles.indexOf('Far Track') !== -1 &&
    visibleTitles.indexOf('Close Match') < visibleTitles.indexOf('Far Track') &&
    !visibleTitles.includes('Seed Track'),
  JSON.stringify(visibleTitles),
)

// 5. Clear via the chip's "×" → full list (including Seed Track itself) is back.
await chip.click()
await page.waitForTimeout(100)
ok('chip gone after click', (await page.locator('button', { hasText: 'Similar to:' }).count()) === 0)
const afterClear = await page.locator('tbody tr td:first-child span.truncate').allTextContents()
ok('full list restored after clearing chip', afterClear.includes('Seed Track') && afterClear.includes('Pending Track'), JSON.stringify(afterClear))

// 6. Zero-match case (change-reviewer's blind spot): a library where the
// clicked track is the ONLY embedded one has nothing to compare it to —
// `findSimilarTracks` returns []. The empty state must say so, not fall
// through to the generic "No audio files found" (the library plainly has
// audio files — this is `library-list-copy.ts`'s own silent-skip bug class).
await page.evaluate(async () => {
  const { useStore } = await import('/src/app/state/store.ts')
  const fakeHandle = (name) => ({ getFile: async () => new File([], name) })
  useStore.getState().setLibrary({
    tracks: [
      {
        id: 'lonely-seed',
        name: 'Lonely Seed',
        title: 'Lonely Seed',
        path: 'Lonely Seed.wav',
        kind: 'audio/wav',
        handle: fakeHandle('lonely.wav'),
        contentHash: 'hash-lonely',
        analysisState: 'analyzed',
        embeddingState: 'embedded',
        embedding: Float32Array.from([1, 0, 0, 0, 0]),
      },
      {
        id: 'no-embedding',
        name: 'No Embedding Yet',
        title: 'No Embedding Yet',
        path: 'No Embedding Yet.wav',
        kind: 'audio/wav',
        handle: fakeHandle('none.wav'),
        contentHash: 'hash-none',
        analysisState: 'analyzed',
        // no embedding: not a candidate, so the seed truly has nothing to match.
      },
    ],
    boot: 'loaded',
    scanning: false,
  })
})
await page.waitForTimeout(100)
await page.locator('tbody tr', { hasText: 'Lonely Seed' }).getByRole('button', { name: 'Find similar tracks' }).click()
await page.waitForTimeout(100)
const emptyTitle = await page.locator('text=No similar tracks found yet').count()
const falseEmptyFolder = await page.locator('text=No audio files found').count()
ok('zero-match: shows "No similar tracks found yet"', emptyTitle > 0)
ok('zero-match: does NOT falsely claim the folder has no audio files', falseEmptyFolder === 0)
const clearBtn = page.getByRole('button', { name: 'Clear similar filter' })
ok('zero-match: offers a "Clear similar filter" action', (await clearBtn.count()) > 0)
await clearBtn.click()
await page.waitForTimeout(100)
const afterZeroClear = await page.locator('tbody tr td:first-child span.truncate').allTextContents()
ok('zero-match: clearing restores the list', afterZeroClear.includes('Lonely Seed') && afterZeroClear.includes('No Embedding Yet'), JSON.stringify(afterZeroClear))

ok('no console errors', errors.length === 0, errors[0])

await browser.close()
const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
