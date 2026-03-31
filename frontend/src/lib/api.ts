import axios from 'axios'

const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
export const API_BASE = isProduction ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost/hotel-tech/apps/loyalty/backend/public/api')
export const API_URL = isProduction ? '' : API_BASE.replace(/\/api$/, '')

/** Base path for the admin SPA (reads from <base> tag or defaults to "/"). */
export const APP_BASE = (() => {
  const el = document.querySelector('base')
  if (el?.href) {
    try { return new URL(el.href).pathname.replace(/\/+$/, '') } catch {}
  }
  return ''
})()

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

// Attach Bearer token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      window.location.href = `${APP_BASE}/login`
    }
    return Promise.reject(error)
  }
)
