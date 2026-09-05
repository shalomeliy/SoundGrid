/**
 * One-off diagnostic (not part of the suite) — isolates whether the fake
 * `indexedDB` the other verify-*.mjs scripts rely on actually resolves
 * idb-keyval's get() on this machine, with zero SoundGrid app code involved.
 * Run: node scripts/diag-idb-mock.mjs
 *
 * SUPERSEDED — kept only as a reusable indexedDB-mock isolation tool, not as
 * live evidence of anything. This was written on the hypothesis that the fake
 * `indexedDB` was why `library.boot` hung on `'checking'` forever on the real
 * machine; it ran clean here and there both, which at the time looked like it
 * ruled the mock out. The real cause (found afterward, v0.4.6 step 8's later
 * commits) was unrelated: a long-running `npm run dev` had accumulated enough
 * Vite module-cache/HMR history that `import('/src/app/state/store.ts')`
 * resolved a store instance disconnected from the one the rendered page was
 * actually using. If you're debugging a hung `boot` state again, check that
 * first (restart the dev server) before assuming it's this mock.
 */
import { chromium } from 'playwright'

const harness = `(() => {
  window.__log = [];
  const mem = new Map();
  mem.set('hello', 'world');
  const fire = (obj, prop, value) => setTimeout(() => { obj.result = value; obj[prop] && obj[prop](); }, 0);
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: {
    open() {
      window.__log.push('open() called');
      const req = {};
      setTimeout(() => {
        window.__log.push('open() firing onsuccess');
        const db = { transaction: () => {
          window.__log.push('db.transaction() called');
          const tx = {};
          tx.objectStore = () => ({
            transaction: tx,
            get: (k) => { window.__log.push('store.get(' + k + ') called'); const r = {}; fire(r, 'onsuccess', mem.get(k)); return r; },
            put: (v, k) => { mem.set(k, v); const r = {}; fire(r, 'onsuccess', undefined); return r; },
          });
          setTimeout(() => tx.oncomplete && tx.oncomplete(), 1);
          return tx;
        } };
        req.result = db;
        req.onsuccess && req.onsuccess();
      }, 0);
      return req;
    },
  } });
})()`

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', (m) => console.log('CONSOLE:', m.text()))
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)))
await page.addInitScript(harness)
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })

const result = await page.evaluate(async () => {
  // Reproduces idb-keyval's own createStore()/get() exactly (copied from
  // node_modules/idb-keyval/dist/index.js) without importing the package
  // itself — a bare specifier import('idb-keyval') can't resolve from
  // page.evaluate (no import map), and this is more transparent anyway:
  // it shows which specific step hangs.
  function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.oncomplete = request.onsuccess = () => resolve(request.result)
      request.onabort = request.onerror = () => reject(request.error)
    })
  }
  const withTimeout = (p, ms, label) =>
    Promise.race([
      p.then((v) => ({ ok: true, v })),
      new Promise((r) => setTimeout(() => r({ ok: false, label }), ms)),
    ])

  const request = window.indexedDB.open('keyval-store')
  request.onupgradeneeded = () => request.result.createObjectStore('keyval')
  const dbResult = await withTimeout(promisifyRequest(request), 8000, 'db-open')
  if (!dbResult.ok) return { failedAt: dbResult.label, log: window.__log }

  const store = dbResult.v.transaction('keyval', 'readonly').objectStore('keyval')
  const getReq = store.get('hello')
  const getResult = await withTimeout(promisifyRequest(getReq), 8000, 'store-get')
  if (!getResult.ok) return { failedAt: getResult.label, log: window.__log }

  return { failedAt: null, value: getResult.v, log: window.__log }
})

console.log(JSON.stringify(result, null, 2))
await browser.close()
