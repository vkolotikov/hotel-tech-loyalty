import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../CrmProvider'
import { Page } from '../ui/Page'
import { Tabs } from '../ui/Tabs'
import { AccountTab } from './AccountTab'
import { CannedTab } from './CannedTab'
import { CustomFieldsTab } from './CustomFieldsTab'
import { LeadFormsTab } from './LeadFormsTab'
import { SETTINGS_TABS, pickTab, type SettingsTab } from './lists'
import { PipelinesTab } from './PipelinesTab'

const TAB_PARAM = 'tab'

/**
 * Settings (HexaTech CRM, 2026-11-07): the inbox's canned replies, the pipelines and why leads are lost, the lead forms
 * for the website, the venue's own fields, and the account's pages. The section is kept in `?tab=` (Get started links
 * to `?tab=pipelines`). Rights are the server's, mirrored by the bootstrap: canned replies `manage_canned`, pipelines
 * and custom fields `manage_pipelines`; lead forms are everyone's, as in the full admin.
 */
export function SettingsPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const [params, setParams] = useSearchParams()
  const tab = pickTab(params.get(TAB_PARAM), SETTINGS_TABS, 'canned')
  const can = boot.staff.can

  const choose = (next: SettingsTab) => setParams(prev => {
    const out = new URLSearchParams(prev)
    if (next === 'canned') out.delete(TAB_PARAM)
    else out.set(TAB_PARAM, next)
    return out
  }, { replace: true })

  return (
    <Page title={t('crm.nav.settings', 'Settings')} line={t('crm.settings.line', 'Replies, pipelines, forms and fields: how HexaTech CRM works for your team.')}
      below={(
        <Tabs label={t('crm.settings.sections', 'Sections')} value={tab} onChange={choose} items={[
          { key: 'canned', label: t('crm.settings.tab.canned', 'Canned replies') },
          { key: 'pipelines', label: t('crm.settings.tab.pipelines', 'Pipelines') },
          { key: 'forms', label: t('crm.settings.tab.forms', 'Lead forms') },
          { key: 'fields', label: t('crm.settings.tab.fields', 'Custom fields') },
          { key: 'account', label: t('crm.settings.tab.account', 'Account') },
        ]} />
      )}>
      {tab === 'canned' && <CannedTab canManage={can.manage_canned} />}
      {tab === 'pipelines' && <PipelinesTab canManage={can.manage_pipelines} />}
      {tab === 'forms' && <LeadFormsTab />}
      {tab === 'fields' && <CustomFieldsTab canManage={can.manage_pipelines} />}
      {tab === 'account' && <AccountTab />}
    </Page>
  )
}
