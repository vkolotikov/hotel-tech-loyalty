import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { registerWorkspaceLocales } from '../workspace/i18n'
import { registerLoyaltyLocales } from './i18n'
import { loginPath } from './lib/links'
import { LoyaltyProvider } from './LoyaltyProvider'
import { LoyaltyShell } from './LoyaltyShell'
import { AppPage } from './app/AppPage'
import { CampaignPage } from './campaigns/CampaignPage'
import { CampaignsPage } from './campaigns/CampaignsPage'
import { EventPage } from './events/EventPage'
import { EventsPage } from './events/EventsPage'
import { GuidePage } from './guide/GuidePage'
import { InsightsPage } from './insights/InsightsPage'
import { MemberPage } from './member/MemberPage'
import { DuplicatesPage } from './membership/DuplicatesPage'
import { ImportPage } from './membership/ImportPage'
import { MembersPage } from './members/MembersPage'
import { OptionsPage } from './options/OptionsPage'
import { SetupWizard } from './options/SetupWizard'
import { ProgramPage } from './program/ProgramPage'
import { RequestsPage } from './requests/RequestsPage'
import { RewardsPage } from './rewards/RewardsPage'
import { DoorPage } from './scan/DoorPage'
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

  // Release 8: door mode is a full-screen scanner for a tablet at an entrance — no menus, so outside the shell.
  if (location.pathname.startsWith('/loyalty/scan/door')) {
    return <LoyaltyProvider><DoorPage /></LoyaltyProvider>
  }

  return (
    <LoyaltyProvider>
      <LoyaltyShell>
        <Routes>
          <Route index element={<MembersPage />} />
          <Route path="members/duplicates" element={<DuplicatesPage />} />
          <Route path="members/import" element={<ImportPage />} />
          <Route path="members/:id" element={<MemberPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="program" element={<ProgramPage />} />
          <Route path="options" element={<OptionsPage />} />
          <Route path="options/setup" element={<SetupWizard />} />
          <Route path="rewards" element={<RewardsPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/:id" element={<EventPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="campaigns/:id" element={<CampaignPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="app" element={<AppPage />} />
          <Route path="guide" element={<GuidePage />} />
          <Route path="*" element={<Navigate to="/loyalty" replace />} />
        </Routes>
      </LoyaltyShell>
    </LoyaltyProvider>
  )
}
