import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { registerAppointmentsLocales } from './i18n'
import { AppointmentsProvider } from './AppointmentsProvider'
import { AppointmentsShell } from './AppointmentsShell'
import { CalendarPage } from './calendar/CalendarPage'
import { ClientsPage } from './clients/ClientsPage'
import { ClientProfile } from './clients/ClientProfile'

registerAppointmentsLocales()

/**
 * Everything under /appointments/* for a signed-in staff user. Whether the
 * organisation may use it is the server's answer (the bootstrap call is
 * behind `workspace:appointments`); the shell turns a refusal into a way
 * back to the full admin.
 */
export function AppointmentsApp() {
  const { token, user } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  if (user?.user_type === 'member') return <Navigate to="/portal" replace />

  return (
    <AppointmentsProvider>
      <AppointmentsShell>
        <Routes>
          <Route index element={<CalendarPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientProfile />} />
          <Route path="*" element={<Navigate to="/appointments" replace />} />
        </Routes>
      </AppointmentsShell>
    </AppointmentsProvider>
  )
}
