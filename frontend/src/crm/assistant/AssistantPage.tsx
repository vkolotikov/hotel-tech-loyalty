import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, GraduationCap, MessagesSquare, SlidersHorizontal, Zap } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { crmApi, get } from '../lib/api'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { FeatureLocked } from '../ui/QueryState'
import { SectionNav, type Section } from '../ui/SectionNav'
import { BehaviourTab } from './BehaviourTab'
import { KnowledgeTab } from './KnowledgeTab'
import { ASSISTANT_TABS, pickTab, withTab, type AssistantTab } from './lists'
import { PopupsTab } from './PopupsTab'
import { BEHAVIOUR_KEY, GAPS_KEY } from './queries'
import { TeachTab } from './TeachTab'
import { TryTab } from './TryTab'
import type { BehaviourConfig } from './types'

const TAB_PARAM = 'tab'
const ID_PREFIX = 'assistant-section'
const PANEL_ID = 'assistant-panel'

/**
 * The AI assistant (HexaTech CRM; round 2 "structured sections"): the website chat's assistant, on the full admin's
 * chatbot endpoints — how it behaves, what it knows, the answers to fix (new), a test chat and the pop-ups, as five
 * sections in `?tab=` (Get started links to `?tab=knowledge`). Changes are a manager's (`staff.can.manage_bot`); a plan
 * without the chatbot sees why instead.
 */
export function AssistantPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const [params, setParams] = useSearchParams()
  const tab = pickTab(params.get(TAB_PARAM), ASSISTANT_TABS, 'behaviour')
  const canManage = boot.staff.can.manage_bot
  const locked = !boot.features.chatbot
  const gaps = useQuery({ queryKey: GAPS_KEY, queryFn: crmApi.botGaps, enabled: !locked, staleTime: 30_000 })
  const behaviour = useQuery({ queryKey: BEHAVIOUR_KEY, queryFn: () => get<BehaviourConfig>('chatbot-config/behavior'), enabled: !locked })
  const answering = behaviour.data ? behaviour.data.is_active !== false : null

  const choose = (next: AssistantTab) => setParams(prev => withTab(prev, TAB_PARAM, next, 'behaviour'), { replace: true })

  const sections: Section<AssistantTab>[] = [
    { key: 'behaviour', icon: SlidersHorizontal, tone: 'ai', title: t('crm.assistant.tab.behaviour', 'Behaviour'), caption: t('crm.assistant.caption.behaviour', 'Who it is, how it talks, when it hands over.') },
    { key: 'knowledge', icon: BookOpen, tone: 'accent', title: t('crm.assistant.tab.knowledge', 'Knowledge'), caption: t('crm.assistant.caption.knowledge', 'The answers and documents it answers from.') },
    { key: 'teach', icon: GraduationCap, tone: 'danger', title: t('crm.assistant.tab.teach', 'Answers to fix'), caption: t('crm.assistant.caption.teach', 'Answers your team rated wrong in the inbox.'), badge: gaps.data?.length },
    { key: 'try', icon: MessagesSquare, tone: 'progress', title: t('crm.assistant.tab.try', 'Try it'), caption: t('crm.assistant.caption.try', 'Chat with it before your visitors do.') },
    { key: 'popups', icon: Zap, tone: 'pending', title: t('crm.assistant.tab.popups', 'Pop-ups'), caption: t('crm.assistant.caption.popups', 'Open the chat by itself on the pages you choose.') },
  ]

  return (
    <Page title={t('crm.nav.assistant', 'AI assistant')}
      line={t('crm.assistant.line', 'The assistant in your website chat: how it speaks, what it knows, and what to fix.')}
      actions={locked ? undefined : (
        <>
          {answering !== null && (
            <Pill tone={answering ? 'success' : 'neutral'}>
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${answering ? 'bg-a-st-confirmed' : 'bg-a-text-2'}`} />
              {answering ? t('crm.assistant.state_on', 'Answering visitors') : t('crm.assistant.state_off', 'Switched off')}
            </Pill>
          )}
          {canManage && tab !== 'try' && (
            <Button variant="secondary" onClick={() => choose('try')}><MessagesSquare size={15} aria-hidden />{t('crm.assistant.try_it', 'Try the assistant')}</Button>
          )}
        </>
      )}>
      {locked ? <FeatureLocked /> : (
        <>
          <SectionNav label={t('crm.assistant.sections', 'Sections')} idPrefix={ID_PREFIX} panelId={PANEL_ID} sections={sections} value={tab} onChange={choose} />
          <div id={PANEL_ID} role="tabpanel" aria-labelledby={`${ID_PREFIX}-${tab}`} className="min-w-0 animate-a-fade" key={tab}>
            {tab === 'behaviour' && <BehaviourTab canManage={canManage} />}
            {tab === 'knowledge' && <KnowledgeTab canManage={canManage} />}
            {tab === 'teach' && <TeachTab gaps={gaps} canManage={canManage} />}
            {tab === 'try' && <TryTab canManage={canManage} assistantName={behaviour.data?.assistant_name ?? null} />}
            {tab === 'popups' && <PopupsTab canManage={canManage} />}
          </div>
        </>
      )}
    </Page>
  )
}
