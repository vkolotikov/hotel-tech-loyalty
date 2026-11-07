import { useTranslation } from 'react-i18next'
import { Page } from '../ui/Page'

/** Placeholder: this area is being built. */
export function VisitorsPage() {
  const { t } = useTranslation()
  return <Page title={t('crm.nav.visitors', 'Visitors')}><p className="text-sm text-a-text-2">…</p></Page>
}
