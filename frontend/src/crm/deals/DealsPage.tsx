import { useTranslation } from 'react-i18next'
import { WonDeals } from '../pipeline/WonDeals'
import { Page } from '../ui/Page'

/** Deals: won leads working through fulfilment and payment (the main platform's Deals). Rebuilt in round 2. */
export function DealsPage() {
  const { t } = useTranslation()
  return <Page title={t('crm.nav.deals', 'Deals')}><WonDeals /></Page>
}
