import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost/hotel-tech/apps/loyalty/backend/public/api'
export const API_URL = API_BASE.replace(/\/api$/, '')

/** Base path for the React Router. Empty in production (PHP serves SPA at root). */
export const APP_BASE: string = (import.meta.env.VITE_ROUTER_BASE as string) ?? ''

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
