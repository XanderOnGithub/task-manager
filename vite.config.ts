import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri loads the dev server at a fixed port, so Vite must not pick another one.
// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Rust and data changes are handled by Tauri, not the Vite reloader.
      ignored: ['**/src-tauri/**', '**/core/**', '**/sample-data/**'],
    },
  },
})
