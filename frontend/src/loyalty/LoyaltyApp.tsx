import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { registerWorkspaceLocales } from '../workspace/i18n'
import { registerLoyaltyLocales } from './i18n'
import { loginPath } from './lib/links'
import { LoyaltyProvider } from './LoyaltyProvider'
import { LoyaltyShell } from './LoyaltyShell'
import { MemberPage } from './member/MemberPage'
import { MembersPage } from './members/MembersPage'
import { ProgramPage } from './program/ProgramPage'
import { RequestsPage } from './requests/RequestsPage'
import { RewardsPage } from './rewards/RewardsPage'
import { ScanPage } from './scan/ScanPage'

registerWorkspaceLocales()
registerLoyaltyLocales()

/**
 * Everything under /loyalty/* for a signed-in staff user (spec 2026-10-21).
 * Whether the organisation may use it is the server's answer (the bootstrap
 * is behind `workspace:loyalty`); the shell turns a refusal into a way back
 * to the full admin. Signed out, the sign-in screen brings the visitor back.
 */
export function LoyaltyApp() {
  const { token, user } = useAuthStore()
  const location = useLocation()
  if (!token) return <Navigate to={loginPath(location)} replace />
  if (user?.user_type === 'member') return <Navigate to="/portal" replace />

  return (
    <LoyaltyProvider>
      <LoyaltyShell>
        <Routes>
          <Route index element={<MembersPage />} />
          <Route path="members/:id" element={<MemberPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="program" element={<ProgramPage />} />
          <Route path="rewards" element={<RewardsPage />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="*" element={<Navigate to="/loyalty" replace />} />
        </Routes>
      </LoyaltyShell>
    </LoyaltyProvider>
  )
}
