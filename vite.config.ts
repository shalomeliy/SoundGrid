import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8')) as {
  version: string
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Layer-addressed imports. A file's import path now says which layer it is
    // reaching into, instead of a count of ../ that changes when anything moves.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    // The client's only source for its own version number — read from
    // package.json at build time, never typed a second time. See
    // tests/repo/client-version.test.ts, which fails on a second hard-coded copy.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
