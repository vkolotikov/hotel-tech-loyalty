import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Gauge, KeyRound, Mail, MessagesSquare, Plug } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { Page } from '../ui/Page'
import { SectionNav, type Section } from '../ui/SectionNav'
import { AiUsageTab } from './AiUsageTab'
import { ChannelsTab } from './ChannelsTab'
import { EmailTab } from './EmailTab'
import { LeadIntakeTab } from './LeadIntakeTab'
import { pickTab, tabsFor, withTab, type IntegrationsTab } from './integrationsLogic'

const ID_PREFIX = 'integrations-section'
const PANEL_ID = 'integrations-panel'

/**
 * Integrations (HexaTech CRM round 5, 2026-11-12): what connects the CRM to the outside — API tokens and the guide for
 * sending leads in, the emails' sender, the month's AI spend against the plan's allowance, and the Messenger pages the
 * inbox shows. Sections in `?tab=`. Who may see and change what is the server's (AccessMap); the bootstrap's
 * `staff.can.manage_integrations` only hides what a staff member would be refused: they see the sender, read only.
 */
export function IntegrationsPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const [params, setParams] = useSearchParams()
  const canManage = boot.staff.can.manage_integrations === true
  const allowed = tabsFor(canManage)
  const tab = pickTab(params.get('tab'), allowed)
  const choose = (next: IntegrationsTab) => setParams(prev => withTab(prev, next, allowed[0]), { replace: true })

  const all: Record<IntegrationsTab, Section<IntegrationsTab>> = {
    leads: { key: 'leads', icon: KeyRound, tone: 'accent', title: t('crm.integrations.tab.leads', 'Lead intake'), caption: t('crm.integrations.caption.leads', 'API tokens and the guide for sending leads in from your website or another system.') },
    email: { key: 'email', icon: Mail, tone: 'progress', title: t('crm.integrations.tab.email', 'Email'), caption: t('crm.integrations.caption.email', 'The name and reply-to address on the emails you send.') },
    ai: { key: 'ai', icon: Gauge, tone: 'ai', title: t('crm.integrations.tab.ai', 'AI usage'), caption: t('crm.integrations.caption.ai', "This month's AI spend against your plan's allowance.") },
    channels: { key: 'channels', icon: MessagesSquare, tone: 'success', title: t('crm.integrations.tab.channels', 'Channels'), caption: t('crm.integrations.caption.channels', 'Facebook Messenger pages and other channels for the inbox.') },
  }

  return (
    <Page icon={Plug} title={t('crm.nav.integrations', 'Integrations')}
      line={t('crm.integrations.line', 'Connect your website, email and messaging channels, and keep an eye on AI spend.')}>
      {allowed.length > 1 && (
        <SectionNav label={t('crm.integrations.sections', 'Sections')} idPrefix={ID_PREFIX} panelId={PANEL_ID}
          sections={allowed.map(key => all[key])} value={tab} onChange={choose} />
      )}
      <div id={PANEL_ID} role={allowed.length > 1 ? 'tabpanel' : undefined} aria-labelledby={allowed.length > 1 ? `${ID_PREFIX}-${tab}` : undefined}
        className="min-w-0 animate-a-fade" key={tab}>
        {tab === 'leads' && <LeadIntakeTab />}
        {tab === 'email' && <EmailTab />}
        {tab === 'ai' && <AiUsageTab />}
        {tab === 'channels' && <ChannelsTab />}
      </div>
    </Page>
  )
}
