import axios from 'axios'

const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
export const API_BASE = isProduction ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost/hotel-tech/apps/loyalty/backend/public/api')
export const API_URL = isProduction ? '' : API_BASE.replace(/\/api$/, '')

/** Base path for the admin SPA router (empty = served at root). */
export const APP_BASE = ''

/** Resolve a storage image URL for display. Handles absolute localhost URLs and relative /storage/ paths. */
export function resolveImage(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(\/storage\/.*)/)
  if (m) return API_URL + m[1]
  if (url.startsWith('/')) return API_URL + url
  return url
}

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

// Attach Bearer token + strip Content-Type on FormData uploads.
// Axios will only set the multipart boundary when Content-Type is unset; if
// we leave the default 'application/json' header in place for a FormData
// body, the server can't parse the multipart parts and file uploads silently
// fail (this is what was breaking BookingExtras image upload).
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    // Let the browser/axios set the boundary itself.
    delete (config.headers as Record<string, unknown>)['Content-Type']
    delete (config.headers as Record<string, unknown>)['content-type']
  }

  // Auto-inject the current brand selection on every request so the backend
  // BrandMiddleware sees it without each call site remembering to pass it.
  // Read directly from the persisted localStorage snapshot to avoid pulling
  // a zustand subscription into this module (api.ts is imported very early,
  // before the store is initialized in some code paths). The shape mirrors
  // brandStore.ts's `partialize`: { state: { currentBrandId: number|null } }.
  if (config.url && !/[?&]brand_id=/.test(config.url)) {
    try {
      const raw = localStorage.getItem('loyalty-brand')
      if (raw) {
        const parsed = JSON.parse(raw)
        const id = parsed?.state?.currentBrandId
        config.params = {
          ...(config.params || {}),
          brand_id: id == null ? 'all' : id,
        }
      }
    } catch {
      // Corrupted localStorage — request continues unscoped (backend defaults
      // to "all brands" mode), no point in failing the call.
    }
  }

  return config
})

// Handle 401 globally — but don't redirect for billing/subscription endpoints
// (those return 401 when the SaaS token can't be obtained, not when the user session is invalid)
// Also dispatch 403 subscription_required events to trigger lockout UI
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || ''
      const isBillingCall = url.includes('/billing/') || url.includes('/subscription')
      if (!isBillingCall) {
        // Dynamic import — avoids the api.ts ↔ logout.ts ↔ authStore.ts
        // ↔ queryClient.ts circular-import chain at module-load time.
        // The 401 path is rare and async, so a dynamic import is cheap.
        import('./logout').then(({ logoutAndRedirect }) => { void logoutAndRedirect() })
      }
    }
    if (error.response?.status === 403 &&
        error.response?.data?.error === 'subscription_required') {
      window.dispatchEvent(new CustomEvent('subscription:expired'))
    }
    // 402 Payment Required with structured `feature_locked` body —
    // backend gate said "this plan doesn't include this feature".
    // Emit an app-wide event so a single listener can render the
    // upgrade-prompt UX consistently. The `Layout` toast listener (and
    // any per-page handler that wants to swap in a richer modal)
    // reads the detail payload.
    if (error.response?.status === 402 &&
        error.response?.data?.code === 'feature_locked') {
      window.dispatchEvent(new CustomEvent('feature:locked', {
        detail: {
          feature: error.response.data.feature ?? null,
          plan: error.response.data.plan ?? null,
          upgradeUrl: error.response.data.upgrade_url ?? null,
          message: error.response.data.error ?? 'This feature is not included in your current plan.',
        },
      }))
    }
    return Promise.reject(error)
  }
)
