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
import { Inbox } from './pages/Inbox'
import { Book } from './pages/book/Book'
import { StayBook } from './pages/stay/StayBook'
import { PayReturn } from './pages/book/PayReturn'
import { BookEntry } from './pages/BookEntry'

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
          <Route path="book" element={<BookEntry />} />
          <Route path="book/appointment" element={<Book />} />
          <Route path="book/stay" element={<StayBook />} />
          {/* Release 4, part C: where a bank redirect comes back to (Stripe's return_url). */}
          <Route path="book/return" element={<PayReturn />} />
          <Route path="rewards" element={<Rewards />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="bookings/:kind/:id" element={<Bookings />} />
          <Route path="activity" element={<Activity />} />
          <Route path="profile" element={<Profile />} />
          {/* Release 4, part A: the member's kept notifications. */}
          <Route path="inbox" element={<Inbox />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </PortalShell>
    </PortalProvider>
  )
}
