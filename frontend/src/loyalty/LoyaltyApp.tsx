import { Fragment, lazy, Suspense, type ReactNode } from 'react'
import { MorePage } from './mobile/MobileUI'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { registerWorkspaceLocales } from '../workspace/i18n'
import { registerLoyaltyLocales } from './i18n'
import { loginPath } from './lib/links'
import { LoyaltyProvider } from './LoyaltyProvider'
import { OverviewShell } from './overview/OverviewShell'
import { OverviewSkeleton } from './overview/OverviewUI'
import { ChunkErrorBoundary } from '../components/ChunkErrorBoundary'

// Phones opening Home should not download the campaign editors, charts or scanner decoder.
const CampaignCache = lazy(() => import('./campaigns/design/CampaignUI').then(m => ({ default: m.CampaignCache })))
const SettingsPage = lazy(() => import('./settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const OverviewPage = lazy(() => import('./overview/OverviewPage').then(m => ({ default: m.OverviewPage })))
const AppPage = lazy(() => import('./app/AppPage').then(m => ({ default: m.AppPage })))
const CampaignPage = lazy(() => import('./campaigns/CampaignPage').then(m => ({ default: m.CampaignPage })))
const CampaignsPage = lazy(() => import('./campaigns/CampaignsPage').then(m => ({ default: m.CampaignsPage })))
const EventPage = lazy(() => import('./events/EventPage').then(m => ({ default: m.EventPage })))
const EventsPage = lazy(() => import('./events/EventsPage').then(m => ({ default: m.EventsPage })))
const EventEditorPage = lazy(() => import('./events/design/EventEditorPage').then(m => ({ default: m.EventEditorPage })))
const GuidePage = lazy(() => import('./guide/GuidePage').then(m => ({ default: m.GuidePage })))
const StartPage = lazy(() => import('./start/StartPage').then(m => ({ default: m.StartPage })))
const InsightsPage = lazy(() => import('./insights/InsightsPage').then(m => ({ default: m.InsightsPage })))
const MemberPage = lazy(() => import('./member/MemberPage').then(m => ({ default: m.MemberPage })))
const DuplicatesPage = lazy(() => import('./membership/DuplicatesPage').then(m => ({ default: m.DuplicatesPage })))
const ImportPage = lazy(() => import('./membership/ImportPage').then(m => ({ default: m.ImportPage })))
const MembersPage = lazy(() => import('./members/MembersPage').then(m => ({ default: m.MembersPage })))
const EarnPage = lazy(() => import('./earn/EarnPage').then(m => ({ default: m.EarnPage })))
const SetupWizard = lazy(() => import('./options/SetupWizard').then(m => ({ default: m.SetupWizard })))
const ProgramPage = lazy(() => import('./program/ProgramPage').then(m => ({ default: m.ProgramPage })))
const RequestsPage = lazy(() => import('./requests/RequestsPage').then(m => ({ default: m.RequestsPage })))
const RewardsPage = lazy(() => import('./rewards/RewardsPage').then(m => ({ default: m.RewardsPage })))
const DoorPage = lazy(() => import('./scan/DoorPage').then(m => ({ default: m.DoorPage })))
const ScanPage = lazy(() => import('./scan/ScanPage').then(m => ({ default: m.ScanPage })))

function PageLoad({ children }: { children: ReactNode }) {
  return <ChunkErrorBoundary><Suspense fallback={<OverviewSkeleton />}>{children}</Suspense></ChunkErrorBoundary>
}

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

  if (location.pathname.replace(/\/$/, '') === '/loyalty/overview') {
    return <LoyaltyProvider><OverviewShell><PageLoad><OverviewPage /></PageLoad></OverviewShell></LoyaltyProvider>
  }

  // Release 8: door mode is a full-screen scanner for a tablet at an entrance — no menus, so outside the shell.
  if (location.pathname.startsWith('/loyalty/scan/door')) {
    return <LoyaltyProvider><PageLoad><DoorPage /></PageLoad></LoyaltyProvider>
  }

  const isCampaigns = /^\/loyalty\/campaigns(?:\/|$)/.test(location.pathname)
  const CampaignScope = isCampaigns ? CampaignCache : Fragment
  const Shell = OverviewShell
  return (
    <LoyaltyProvider>
      <Shell>
        <PageLoad><CampaignScope><Routes>
          <Route index element={<MembersPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="members/duplicates" element={<DuplicatesPage />} />
          <Route path="members/import" element={<ImportPage />} />
          <Route path="members/:id" element={<MemberPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="program" element={<ProgramPage />} />
          <Route path="options" element={<EarnPage />} />
          <Route path="options/setup" element={<SetupWizard />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="rewards" element={<RewardsPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/new" element={<EventEditorPage />} />
          <Route path="events/:id/edit" element={<EventEditorPage />} />
          <Route path="events/:id" element={<EventPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="campaigns/:id" element={<CampaignPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="app" element={<AppPage />} />
          <Route path="guide" element={<GuidePage />} />
          {/* Release 10: "Start here", the setup steps. */}
          <Route path="start" element={<StartPage />} />
          <Route path="*" element={<Navigate to="/loyalty" replace />} />
        </Routes></CampaignScope></PageLoad>
      </Shell>
    </LoyaltyProvider>
  )
}
