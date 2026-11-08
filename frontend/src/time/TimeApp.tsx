import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ChunkErrorBoundary } from '../components/ChunkErrorBoundary'
import { useAuthStore } from '../stores/authStore'
import { registerWorkspaceLocales } from '../workspace/i18n'
import { Skeleton } from '../workspace/ui/Skeleton'
import { TimeActionsProvider } from './TimeActions'
import { TimeProvider } from './TimeProvider'
import { TimeShell } from './TimeShell'
import { registerTimeLocales } from './i18n'
import { loginPath } from './lib/links'
import { ToastProvider } from './ui/Toast'

// A phone opening My day should not download the boards or the charts.
const TodayPage = lazy(() => import('./today/TodayPage').then(m => ({ default: m.TodayPage })))
const PlanPage = lazy(() => import('./plan/PlanPage').then(m => ({ default: m.PlanPage })))
const BacklogPage = lazy(() => import('./backlog/BacklogPage').then(m => ({ default: m.BacklogPage })))
const TeamPage = lazy(() => import('./team/TeamPage').then(m => ({ default: m.TeamPage })))
const InsightsPage = lazy(() => import('./insights/InsightsPage').then(m => ({ default: m.InsightsPage })))
const SettingsPage = lazy(() => import('./settings/SettingsPage').then(m => ({ default: m.SettingsPage })))

function PageLoad({ children }: { children: ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<div className="space-y-3 p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full" /></div>}>{children}</Suspense>
    </ChunkErrorBoundary>
  )
}

registerWorkspaceLocales()
registerTimeLocales()

/**
 * Everything under /time/* for a signed-in staff user (HexaTech Time Planner, 2026-11-09): the full admin's staff
 * Planner as its own workspace, with AI planning, review, capture and voice. Whether the organisation may use it is the
 * server's answer (the bootstrap is behind `workspace:time`, everything else also behind the plan's `time_management`);
 * the shell turns a refusal into a way back. Signed out, the sign-in page brings the visitor back.
 */
export function TimeApp() {
  const { token, user } = useAuthStore()
  const location = useLocation()
  if (!token) return <Navigate to={loginPath(location)} replace />
  if (user?.user_type === 'member') return <Navigate to="/portal" replace />

  return (
    <TimeProvider>
      <ToastProvider>
        <TimeActionsProvider>
          <TimeShell>
            <PageLoad>
              <Routes>
                <Route index element={<TodayPage />} />
                <Route path="plan" element={<PlanPage />} />
                <Route path="backlog" element={<BacklogPage />} />
                <Route path="team" element={<TeamPage />} />
                <Route path="insights" element={<InsightsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/time" replace />} />
              </Routes>
            </PageLoad>
          </TimeShell>
        </TimeActionsProvider>
      </ToastProvider>
    </TimeProvider>
  )
}
