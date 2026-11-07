import { useTranslation } from 'react-i18next'
import { Page } from '../ui/Page'

/** Placeholder: this area is being built. */
export function PipelinePage() {
  const { t } = useTranslation()
  return <Page title={t('crm.nav.pipeline', 'Pipeline')}><p className="text-sm text-a-text-2">…</p></Page>
}
