import { useAuthStore } from '../../stores/authStore'
import { isAppointmentsOnly } from './landing'

/** Whether the signed-in user's organisation is on the Appointments plan: there is no full admin to point to. */
export function useAppointmentsOnly(): boolean {
  return useAuthStore((s) => isAppointmentsOnly(s.user))
}
