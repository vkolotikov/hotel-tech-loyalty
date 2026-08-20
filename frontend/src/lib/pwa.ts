/**
 * Registers the service worker that makes the admin installable as a desktop
 * app. See public/sw.js for what it does and, more importantly, what it
 * deliberately does not do.
 *
 * Registration is skipped on localhost. The worker only caches /spa/assets/,
 * which the Vite dev server never serves, so it would do nothing useful there
 * while adding one more thing to reason about when a dev build misbehaves.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') return

  // The worker is not needed for first paint, and registering during boot
  // competes with the app's own requests for connection budget. Wait until
  // the page has finished loading.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      // A failed registration costs the install prompt and the asset cache,
      // and nothing else — the app runs normally without it. Log rather than
      // surface anything to the user.
      console.warn('[pwa] service worker registration failed:', err)
    })
  })
}

/**
 * Switches the worker off and clears its cache. Not wired to any UI — it is
 * here so that if the worker ever misbehaves in the field, the fix is one
 * console call on the affected machine rather than a deploy.
 */
export async function disableServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  reg?.active?.postMessage('hexatech:unregister')
  await reg?.unregister()
}
