import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { registerWorkspaceLocales } from '../workspace/i18n'
import { BrandPage } from './brand/BrandPage'
import { ContentProvider } from './ContentProvider'
import { ContentShell } from './ContentShell'
import { registerContentLocales } from './i18n'
import { IdeasPage } from './ideas/IdeasPage'
import { loginPath } from './lib/links'
import { PanelProvider } from './panel/PanelProvider'
import { PostLink } from './panel/PostLink'
import { PlanPage } from './plan/PlanPage'
import { PostsPage } from './posts/PostsPage'
import { StrategyScreen } from './strategy/StrategyScreen'

registerWorkspaceLocales()
registerContentLocales()

/**
 * Everything under /content/* for a signed-in staff user (spec 2026-10-14).
 * Whether the organisation may use it is the server's answer (the bootstrap
 * is behind `workspace:content`); the shell turns a refusal into a way back
 * to the full admin. Signed out, the sign-in screen brings the visitor back.
 */
export function ContentApp() {
  const { token, user } = useAuthStore()
  const location = useLocation()
  if (!token) return <Navigate to={loginPath(location)} replace />
  if (user?.user_type === 'member') return <Navigate to="/portal" replace />

  return (
    <ContentProvider>
      <PanelProvider>
        <ContentShell>
          <Routes>
            <Route index element={<PlanPage />} />
            <Route path="ideas" element={<IdeasPage />} />
            <Route path="posts" element={<PostsPage />} />
            <Route path="posts/:id" element={<PostLink />} />
            <Route path="strategy" element={<StrategyScreen />} />
            <Route path="brand" element={<BrandPage />} />
            <Route path="*" element={<Navigate to="/content" replace />} />
          </Routes>
        </ContentShell>
      </PanelProvider>
    </ContentProvider>
  )
}
