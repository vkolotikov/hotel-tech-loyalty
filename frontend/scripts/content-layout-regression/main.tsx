/* eslint-disable react-refresh/only-export-components -- Standalone browser-test entry point. */
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../src/i18n'
import { registerContentLocales } from '../../src/content/i18n'
import { registerWorkspaceLocales } from '../../src/workspace/i18n'
import { ContentProvider } from '../../src/content/ContentProvider'
import { ContentShell } from '../../src/content/ContentShell'
import { PanelProvider } from '../../src/content/panel/PanelProvider'
import { PlanPage } from '../../src/content/plan/PlanPage'
import '../../src/index.css'
import './api'

registerContentLocales()
registerWorkspaceLocales()
await i18n.changeLanguage(new URLSearchParams(location.search).get('locale') ?? 'en')
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}><MemoryRouter initialEntries={['/content']}>
    <ContentProvider><PanelProvider><ContentShell><PlanPage /></ContentShell></PanelProvider></ContentProvider>
  </MemoryRouter></QueryClientProvider>,
)
