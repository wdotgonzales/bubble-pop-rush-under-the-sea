import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs: Facebook serves the game from a path we do not control.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // The spawn generator and game rules are shared with the server.
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
