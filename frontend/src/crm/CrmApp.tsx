import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ChunkErrorBoundary } from '../components/ChunkErrorBoundary'
import { useAuthStore } from '../stores/authStore'
import { registerWorkspaceLocales } from '../workspace/i18n'
import { Skeleton } from '../workspace/ui/Skeleton'
import { CrmProvider } from './CrmProvider'
import { CrmShell } from './CrmShell'
import { registerCrmLocales } from './i18n'
import { loginPath } from './lib/links'
import { ToastProvider } from './ui/Toast'
import { RecordListProvider } from './lib/useRecords'
import { RecordHost } from './RecordHost'
import { CreateHost } from './CreateHost'

// A phone opening Today should not download the inbox, the board or the charts.
const TodayPage = lazy(() => import('./today/TodayPage').then(m => ({ default: m.TodayPage })))
const StartPage = lazy(() => import('./start/StartPage').then(m => ({ default: m.StartPage })))
const InboxPage = lazy(() => import('./inbox/InboxPage').then(m => ({ default: m.InboxPage })))
const VisitorsPage = lazy(() => import('./visitors/VisitorsPage').then(m => ({ default: m.VisitorsPage })))
const LeadsPage = lazy(() => import('./leads/LeadsPage').then(m => ({ default: m.LeadsPage })))
const LeadPage = lazy(() => import('./leads/LeadPage').then(m => ({ default: m.LeadPage })))
const PipelinePage = lazy(() => import('./pipeline/PipelinePage').then(m => ({ default: m.PipelinePage })))
const DealsPage = lazy(() => import('./deals/DealsPage').then(m => ({ default: m.DealsPage })))
const ContactsPage = lazy(() => import('./contacts/ContactsPage').then(m => ({ default: m.ContactsPage })))
const ContactPage = lazy(() => import('./contacts/ContactPage').then(m => ({ default: m.ContactPage })))
const TasksPage = lazy(() => import('./tasks/TasksPage').then(m => ({ default: m.TasksPage })))
const AssistantPage = lazy(() => import('./assistant/AssistantPage').then(m => ({ default: m.AssistantPage })))
const WidgetPage = lazy(() => import('./widget/WidgetPage').then(m => ({ default: m.WidgetPage })))
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
registerCrmLocales()

/**
 * Everything under /crm/* for a signed-in staff user (HexaTech CRM, 2026-11-07): the AI chat widget, the live inbox and
 * the CRM in one workspace. Whether the organisation may use it is the server's answer (the bootstrap is behind
 * `workspace:crm`); the shell turns a refusal into a way back. Signed out, its own sign-in page brings the visitor back.
 */
export function CrmApp() {
  const { token, user } = useAuthStore()
  const location = useLocation()
  if (!token) return <Navigate to={loginPath(location)} replace />
  if (user?.user_type === 'member') return <Navigate to="/portal" replace />

  return (
    <CrmProvider>
      <ToastProvider>
        <RecordListProvider>
        <CrmShell>
          <PageLoad>
            <Routes>
              <Route index element={<TodayPage />} />
              <Route path="start" element={<StartPage />} />
              <Route path="inbox" element={<InboxPage />} />
              <Route path="visitors" element={<VisitorsPage />} />
              <Route path="leads" element={<LeadsPage />} />
              <Route path="leads/:id" element={<LeadPage />} />
              <Route path="pipeline" element={<PipelinePage />} />
              <Route path="deals" element={<DealsPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              <Route path="contacts/:id" element={<ContactPage />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="assistant" element={<AssistantPage />} />
              <Route path="widget" element={<WidgetPage />} />
              <Route path="insights" element={<InsightsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/crm" replace />} />
            </Routes>
          </PageLoad>
          {/* Round 5: a record or a "new" panel over whichever page the address names it on. */}
          <RecordHost />
          <CreateHost />
        </CrmShell>
        </RecordListProvider>
      </ToastProvider>
    </CrmProvider>
  )
}
