import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: number
  name: string
  email: string
  user_type: string
}

interface Staff {
  role: string
  hotel_name: string
  can_view_analytics: boolean
}

interface AuthState {
  token: string | null
  user: User | null
  staff: Staff | null
  setAuth: (token: string, user: User, staff?: Staff) => void
  logout: () => void
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      staff: null,
      setAuth: (token, user, staff) => {
        localStorage.setItem('auth_token', token)
        set({ token, user, staff })
      },
      logout: () => {
        localStorage.removeItem('auth_token')
        set({ token: null, user: null, staff: null })
      },
      isAdmin: () => {
        const { staff } = get()
        return staff?.role === 'super_admin' || staff?.role === 'manager'
      },
    }),
    { name: 'loyalty-auth' }
  )
)
