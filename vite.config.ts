import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Layer-addressed imports. A file's import path now says which layer it is
    // reaching into, instead of a count of ../ that changes when anything moves.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
