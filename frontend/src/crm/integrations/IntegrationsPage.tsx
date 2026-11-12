import { useTranslation } from 'react-i18next'
import { Plug } from 'lucide-react'
import { Page } from '../ui/Page'

/** Placeholder for round 5's Integrations page (agent E2 replaces it, keeping the export). */
export function IntegrationsPage() {
  const { t } = useTranslation()
  return (
    <Page icon={Plug} title={t('crm.nav.integrations', 'Integrations')}>
      <p className="text-sm text-a-text-2">{t('crm.nav.integrations', 'Integrations')}</p>
    </Page>
  )
}
