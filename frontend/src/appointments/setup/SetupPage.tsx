import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { appointmentsApi } from '../lib/api'
import type { SetupPayload } from '../lib/types'
import { Notice } from '../ui/Notice'
import { Checklist, type SetupTab } from './Checklist'
import { ServicesTab } from './ServicesTab'
import { SettingsTab } from './SettingsTab'
import { TeamTab } from './TeamTab'

const TABS: SetupTab[] = ['services', 'team', 'settings']

// eslint-disable-next-line react-refresh/only-export-components
export function tabOf(raw: string | null): SetupTab {
  return (TABS as string[]).includes(raw ?? '') ? (raw as SetupTab) : 'services'
}

/** Setup in the workspace. A save changes what the calendar and the shell show too, so every workspace query is refreshed. */
export function SetupPage() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['appointments', 'setup'], queryFn: appointmentsApi.setup })
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['appointments'] }) }

  return (
    <SetupView tab={tabOf(params.get('tab'))} onTab={(tab) => setParams({ tab }, { replace: true })}
      data={query.data} loading={query.isLoading} failed={query.isError} refresh={refresh} />
  )
}

export function SetupView({ tab, onTab, data, loading, failed, refresh }: {
  tab: SetupTab; onTab: (tab: SetupTab) => void; data: SetupPayload | undefined; loading: boolean; failed: boolean; refresh: () => void
}) {
  const { t } = useTranslation()
  const labels: Record<SetupTab, string> = {
    services: t('appointments.setup.tabs.services', 'Services'),
    team: t('appointments.setup.tabs.team', 'Team'),
    settings: t('appointments.setup.tabs.settings', 'Settings'),
  }

  return (
    <div className="max-w-5xl space-y-5 p-6">
      <h1 className="text-xl font-semibold text-a-text">{t('appointments.setup.title', 'Setup')}</h1>
      {loading && <p className="text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
      {failed && <Notice tone="danger">{t('appointments.setup.load_failed', 'Setup could not be loaded. Please try again.')}</Notice>}
      {data && (
        <>
          {!data.checklist.complete && <Checklist checklist={data.checklist} onTab={onTab} />}
          {!data.can_manage && (
            <Notice tone="info">{t('appointments.setup.read_only', 'Only an owner or a manager can change setup. You can see it here and manage your own time off under Team.')}</Notice>
          )}
          <div role="tablist" aria-label={t('appointments.setup.title', 'Setup')} className="flex gap-1 border-b border-a-border">
            {TABS.map(key => (
              <button key={key} type="button" role="tab" id={`setup-tab-${key}`} aria-selected={tab === key} aria-controls="setup-panel"
                onClick={() => onTab(key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? 'border-a-accent text-a-text' : 'border-transparent text-a-text-2 hover:text-a-text'}`}>
                {labels[key]}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="setup-panel" aria-labelledby={`setup-tab-${tab}`}>
            {tab === 'services' && <ServicesTab data={data} refresh={refresh} />}
            {tab === 'team' && <TeamTab data={data} refresh={refresh} />}
            {tab === 'settings' && <SettingsTab key={JSON.stringify(data.settings)} data={data} refresh={refresh} />}
          </div>
        </>
      )}
    </div>
  )
}
