import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts are bundled with the app, so they work offline.
import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import '@fontsource/geist-mono/400.css'

import './styles/app.css'
import { domAnimation, LazyMotion, MotionConfig, motion } from 'motion/react'
import App from './App.tsx'
import { spring } from './shared/motion/springs'
import { applyTheme } from './platform/theme'
import { listenForTyping } from './sound/sounds'
import { ToastProvider } from './shared/toast/Toasts'

// Apply the saved theme before the first paint, so there's no flash.
applyTheme()
// Keyboard sounds while typing, if turned on (Settings → Sounds → Fun).
listenForTyping()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": follows the macOS Reduce motion setting. */}
    <MotionConfig reducedMotion="user" transition={spring.snappy}>
      {/* The small animation set (no layout or drag). Rows use the lighter `m` components, which
          need it; see shared/motion/pieces.tsx. */}
      <LazyMotion features={domAnimation} strict>
        <ToastProvider>
          {/* The one animation on first render: the window fades in on launch
            instead of appearing all at once. Everything after that uses initial={false}. */}
          <motion.div className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring.smooth}>
            <App />
          </motion.div>
        </ToastProvider>
      </LazyMotion>
    </MotionConfig>
  </StrictMode>,
)
