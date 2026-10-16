import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts are bundled with the app, so they work offline.
import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import '@fontsource/geist-mono/400.css'

import './styles/app.css'
import { MotionConfig } from 'motion/react'
import App from './App.tsx'
import { spring } from './lib/motion'
import { applyTheme } from './lib/theme'
import { ToastProvider } from './components/Toasts'

// Apply the saved theme before the first paint, so there's no flash.
applyTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": follows the macOS Reduce motion setting. */}
    <MotionConfig reducedMotion="user" transition={spring.snappy}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MotionConfig>
  </StrictMode>,
)
