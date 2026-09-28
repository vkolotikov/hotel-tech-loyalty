import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { registerPortalLocales } from './i18n'
import { PortalProvider } from './PortalProvider'
import { PortalShell } from './PortalShell'
import { Home } from './pages/Home'
import { Rewards } from './pages/Rewards'
import { Bookings } from './pages/Bookings'
import { Activity } from './pages/Activity'
import { Profile } from './pages/Profile'
import { Book } from './pages/book/Book'

registerPortalLocales()

/**
 * Everything under /portal/* for a signed-in member. Staff are sent to the
 * console; nobody without a token gets past the login. Join and claim are
 * public and live outside this tree (App.tsx).
 */
export function PortalApp() {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.user_type === 'staff') return <Navigate to="/" replace />

  return (
    <PortalProvider>
      <PortalShell>
        <Routes>
          <Route index element={<Home />} />
          <Route path="book" element={<Book />} />
          <Route path="rewards" element={<Rewards />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="bookings/:kind/:id" element={<Bookings />} />
          <Route path="activity" element={<Activity />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </PortalShell>
    </PortalProvider>
  )
}
