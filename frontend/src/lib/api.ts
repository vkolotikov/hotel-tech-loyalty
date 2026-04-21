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
        localStorage.removeItem('auth_token')
        window.location.href = `${APP_BASE}/login`
      }
    }
    if (error.response?.status === 403 &&
        error.response?.data?.error === 'subscription_required') {
      window.dispatchEvent(new CustomEvent('subscription:expired'))
    }
    return Promise.reject(error)
  }
)
