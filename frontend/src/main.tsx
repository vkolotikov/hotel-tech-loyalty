import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Initialise i18n BEFORE App renders so the first paint already has
// the right language. Importing for side-effects is intentional.
import './i18n'
import App from './App.tsx'
import { registerServiceWorker } from './lib/pwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Makes the console installable as a desktop app and keeps hashed build
// assets available to tabs left open across a deploy. Never blocks boot.
registerServiceWorker()
