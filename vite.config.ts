import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json' with { type: 'json' }

// Tauri loads the dev server at a fixed port, so Vite must not pick another one.
// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The release stage ("alpha") from package.json, shown next to the version in Settings.
  define: { __APP_STAGE__: JSON.stringify(pkg.stage ?? '') },
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
