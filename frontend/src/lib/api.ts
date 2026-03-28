import axios from 'axios'

const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
const API_BASE = isProduction ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost/hotel-tech/apps/loyalty/backend/public/api')
export const API_URL = isProduction ? '' : API_BASE.replace(/\/api$/, '')

/** Base path for the admin SPA (reads from <base> tag or defaults to "/"). */
export const APP_BASE = (() => {
  const el = document.querySelector('base')
  if (el?.href) {
    try { return new URL(el.href).pathname.replace(/\/+$/, '') } catch {}
  }
  return ''
})()

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
