import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../CrmProvider'
import { crmApi } from '../lib/api'
import { Page } from '../ui/Page'
import { FeatureLocked } from '../ui/QueryState'
import { Tabs } from '../ui/Tabs'
import { BehaviourTab } from './BehaviourTab'
import { KnowledgeTab } from './KnowledgeTab'
import { ASSISTANT_TABS, pickTab, type AssistantTab } from './lists'
import { PopupsTab } from './PopupsTab'
import { GAPS_KEY } from './queries'
import { TeachTab } from './TeachTab'
import { TryTab } from './TryTab'

/**
 * The AI assistant (HexaTech CRM, 2026-11-07): the website chat's assistant, rebuilt from the full admin's chatbot
 * setup on the same endpoints — how it speaks, what it knows, the answers to fix (new), a test chat and the pop-ups.
 * The section is kept in `?tab=` (Get started links to `?tab=knowledge`). Changes are a manager's
 * (`staff.can.manage_bot`); a plan without the chatbot sees why instead.
 */
export function AssistantPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const [params, setParams] = useSearchParams()
  const tab = pickTab(params.get('tab'), ASSISTANT_TABS, 'behaviour')
  const canManage = boot.staff.can.manage_bot
  const locked = !boot.features.chatbot
  const gaps = useQuery({ queryKey: GAPS_KEY, queryFn: crmApi.botGaps, enabled: !locked, staleTime: 30_000 })

  const choose = (next: AssistantTab) => setParams(prev => {
    const out = new URLSearchParams(prev)
    if (next === 'behaviour') out.delete('tab')
    else out.set('tab', next)
    return out
  }, { replace: true })

  return (
    <Page title={t('crm.nav.assistant', 'AI assistant')}
      line={t('crm.assistant.line', 'The assistant in your website chat: how it speaks, what it knows, and what to fix.')}
      below={locked ? undefined : (
        <Tabs label={t('crm.assistant.sections', 'Sections')} value={tab} onChange={choose} items={[
          { key: 'behaviour', label: t('crm.assistant.tab.behaviour', 'Behaviour') },
          { key: 'knowledge', label: t('crm.assistant.tab.knowledge', 'Knowledge') },
          { key: 'teach', label: t('crm.assistant.tab.teach', 'Answers to fix'), count: gaps.data?.length },
          { key: 'try', label: t('crm.assistant.tab.try', 'Try it') },
          { key: 'popups', label: t('crm.assistant.tab.popups', 'Pop-ups') },
        ]} />
      )}>
      {locked ? <FeatureLocked /> : (
        <>
          {tab === 'behaviour' && <BehaviourTab canManage={canManage} />}
          {tab === 'knowledge' && <KnowledgeTab canManage={canManage} />}
          {tab === 'teach' && <TeachTab gaps={gaps} canManage={canManage} />}
          {tab === 'try' && <TryTab canManage={canManage} />}
          {tab === 'popups' && <PopupsTab canManage={canManage} />}
        </>
      )}
    </Page>
  )
}
