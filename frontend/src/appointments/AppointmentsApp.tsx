import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { registerAppointmentsLocales } from './i18n'
import { AppointmentsProvider } from './AppointmentsProvider'
import { AppointmentsShell } from './AppointmentsShell'
import { CalendarPage } from './calendar/CalendarPage'
import { ClientsPage } from './clients/ClientsPage'
import { ClientProfile } from './clients/ClientProfile'
import { InsightsPage } from './insights/InsightsPage'
import { loginPath } from './lib/landing'
import { SetupPage } from './setup/SetupPage'
import { TakingsPage } from './takings/TakingsPage'

registerAppointmentsLocales()

/**
 * Everything under /appointments/* for a signed-in staff user. Whether the
 * organisation may use it is the server's answer (the bootstrap call is
 * behind `workspace:appointments`); the shell turns a refusal into a way
 * back to the full admin. Signed out, the sign-in screen brings the visitor
 * back to the page they asked for.
 */
export function AppointmentsApp() {
  const { token, user } = useAuthStore()
  const location = useLocation()
  if (!token) return <Navigate to={loginPath(location)} replace />
  if (user?.user_type === 'member') return <Navigate to="/portal" replace />

  return (
    <AppointmentsProvider>
      <AppointmentsShell>
        <Routes>
          <Route index element={<CalendarPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientProfile />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="takings" element={<TakingsPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="*" element={<Navigate to="/appointments" replace />} />
        </Routes>
      </AppointmentsShell>
    </AppointmentsProvider>
  )
}
