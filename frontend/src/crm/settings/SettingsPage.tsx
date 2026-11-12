import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, ClipboardList, Columns3, Mails, MessageSquareReply, Settings2, SlidersHorizontal } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { Page } from '../ui/Page'
import { SectionNav, type Section } from '../ui/SectionNav'
import { AccountTab } from './AccountTab'
import { CannedTab } from './CannedTab'
import { CustomFieldsTab } from './CustomFieldsTab'
import { LeadFormsTab } from './LeadFormsTab'
import { SETTINGS_TABS, pickTab, type SettingsTab } from './lists'
import { withSection } from './sectionLogic'
import { PipelinesTab } from './PipelinesTab'
import { TemplatesTab } from '../templates/TemplatesTab'

const TAB_PARAM = 'tab'
const ID_PREFIX = 'settings-section'
const PANEL_ID = 'settings-panel'

/**
 * Settings (HexaTech CRM; round 2 "structured sections"): the inbox's canned replies, the pipelines and why leads are
 * lost, the lead forms for the website, the venue's own fields, the email templates (round 5: a CRM-only organisation
 * has no full admin to make them in) and the account's pages — six sections in `?tab=` (Get started links to
 * `?tab=pipelines`). Rights are the server's, mirrored by the bootstrap: canned replies `manage_canned`, pipelines and
 * custom fields `manage_pipelines`, templates `manage_templates`; lead forms are everyone's, as in the full admin.
 */
export function SettingsPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const [params, setParams] = useSearchParams()
  const tab = pickTab(params.get(TAB_PARAM), SETTINGS_TABS, 'canned')
  const can = boot.staff.can

  // A section's own open item (the template being edited, `?template=`) does not follow to another section.
  const choose = (next: SettingsTab) => setParams(prev => withSection(prev, next, 'canned', TAB_PARAM, 'template'), { replace: true })

  const sections: Section<SettingsTab>[] = [
    { key: 'canned', icon: MessageSquareReply, tone: 'accent', title: t('crm.settings.tab.canned', 'Canned replies'), caption: t('crm.settings.caption.canned', 'Short answers the team inserts in the inbox.') },
    { key: 'pipelines', icon: Columns3, tone: 'progress', title: t('crm.settings.tab.pipelines', 'Pipelines'), caption: t('crm.settings.caption.pipelines', 'The stages of a lead, and why leads are lost.') },
    { key: 'forms', icon: ClipboardList, tone: 'success', title: t('crm.settings.tab.forms', 'Lead forms'), caption: t('crm.settings.caption.forms', 'Forms on your website that send you leads.') },
    { key: 'fields', icon: SlidersHorizontal, tone: 'pending', title: t('crm.settings.tab.fields', 'Custom fields'), caption: t('crm.settings.caption.fields', 'Your own fields on leads, contacts and tasks.') },
    { key: 'templates', icon: Mails, tone: 'ai', title: t('crm.settings.tab.templates', 'Templates'), caption: t('crm.settings.caption.templates', 'Email templates your team sends from a lead.') },
    { key: 'account', icon: Building2, tone: 'neutral', title: t('crm.settings.tab.account', 'Account'), caption: t('crm.settings.caption.account', 'Your team, and your plan.') },
  ]

  return (
    <Page icon={Settings2} title={t('crm.nav.settings', 'Settings')} line={t('crm.settings.line', 'Replies, pipelines, forms and fields: how HexaTech CRM works for your team.')}>
      <SectionNav label={t('crm.settings.sections', 'Sections')} idPrefix={ID_PREFIX} panelId={PANEL_ID} sections={sections} value={tab} onChange={choose} />
      <div id={PANEL_ID} role="tabpanel" aria-labelledby={`${ID_PREFIX}-${tab}`} className="min-w-0 animate-a-fade" key={tab}>
        {tab === 'canned' && <CannedTab canManage={can.manage_canned} />}
        {tab === 'pipelines' && <PipelinesTab canManage={can.manage_pipelines} />}
        {tab === 'forms' && <LeadFormsTab />}
        {tab === 'fields' && <CustomFieldsTab canManage={can.manage_pipelines} />}
        {tab === 'templates' && <TemplatesTab canManage={can.manage_templates === true} />}
        {tab === 'account' && <AccountTab />}
      </div>
    </Page>
  )
}
