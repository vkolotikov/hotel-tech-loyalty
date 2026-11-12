import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Code2, MessageCircleMore, MessageSquareText, Palette } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { SectionNav, type Section } from '../ui/SectionNav'
import { useToast } from '../ui/Toast'
import { BehaviourTab } from './BehaviourTab'
import { EMBED_KEY } from './embed'
import { InstallTab } from './InstallTab'
import { LookTab } from './LookTab'
import { ReadOnlyNote, SaveBar } from './parts'
import { flaggedParts, pickPart, withPart, withSection } from '../settings/sectionLogic'
import { CHAT_PARTS, LOOK_PARTS, WIDGET_KEY, WIDGET_TABS, partOf, pickTab, tabOfPart, type ChatPart, type LookPart, type WidgetTab } from './tabs'
import { sameWidget, widgetForm, widgetPayload, widgetProblems, type WidgetConfig, type WidgetForm } from './widgetForm'

const TAB_PARAM = 'tab'
const ID_PREFIX = 'widget-section'
const PANEL_ID = 'widget-panel'

/**
 * The chat widget (HexaTech CRM; round 2 "structured sections"): how the website chat looks, how it behaves with a
 * visitor, and how to put it on the site — the full admin's widget settings on the same endpoints (widget-config), as
 * three sections in `?tab=` (Get started links to `?tab=install`). Look and Behaviour are one form with one save bar;
 * Install reads the server's code and replaces the key. Changes are a manager's (`staff.can.manage_widget`).
 */
export function WidgetPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const qc = useQueryClient()
  const say = useToast()
  const [params, setParams] = useSearchParams()
  const tab = pickTab(params.get(TAB_PARAM), WIDGET_TABS, 'look')
  const canManage = boot.staff.can.manage_widget
  const query = useQuery({ queryKey: WIDGET_KEY, queryFn: () => get<WidgetConfig>('widget-config') })
  const saved = useMemo(() => widgetForm(query.data), [query.data])
  const [draft, setDraft] = useState<WidgetForm | null>(null)
  const form = draft ?? saved
  const dirty = draft !== null && !sameWidget(draft, saved)
  const problems = widgetProblems(form)
  const update = (patch: Partial<WidgetForm>) => setDraft(prev => ({ ...(prev ?? saved), ...patch }))

  const save = useMutation({
    mutationFn: () => send<WidgetConfig>('put', 'widget-config', widgetPayload(form)),
    onSuccess: data => {
      qc.setQueryData(WIDGET_KEY, data)
      setDraft(null)
      void qc.invalidateQueries({ queryKey: EMBED_KEY })
      void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
      say(t('crm.widget.saved', 'Saved. Your website shows the change within a minute.'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })

  const choose = (next: WidgetTab) => setParams(prev => withSection(prev, next, 'look', TAB_PARAM), { replace: true })
  const lookPart = pickPart(params.get('part'), LOOK_PARTS)
  const chatPart = pickPart(params.get('part'), CHAT_PARTS)
  const choosePart = (keys: readonly string[]) => (next: string) => setParams(prev => withPart(prev, keys, next), { replace: true })
  // The parts (and sections) holding a field the server would refuse, so the person finds what the save bar means.
  const flagged = flaggedParts(problems.map(p => p.field), partOf)
  const flaggedTab = (key: WidgetTab) => [...flagged].some(p => tabOfPart(p) === key) ? '!' : undefined

  const sections: Section<WidgetTab>[] = [
    { key: 'look', icon: Palette, tone: 'accent', title: t('crm.widget.tab.look', 'Look'), caption: t('crm.widget.caption.look', 'Colours, the launcher and the words visitors read.'), badge: tab === 'look' ? undefined : flaggedTab('look') },
    { key: 'behaviour', icon: MessageCircleMore, tone: 'progress', title: t('crm.widget.tab.behaviour', 'Behaviour'), caption: t('crm.widget.caption.behaviour', 'Contact details, opening hours, a way to a person.'), badge: tab === 'behaviour' ? undefined : flaggedTab('behaviour') },
    { key: 'install', icon: Code2, tone: 'success', title: t('crm.widget.tab.install', 'Install'), caption: t('crm.widget.caption.install', 'The code for your website, and where it goes.') },
  ]

  return (
    <Page icon={MessageSquareText} title={t('crm.nav.widget', 'Chat widget')} line={t('crm.widget.line', 'The chat on your website: how it looks, how it greets visitors, and how to put it on your site.')}
      actions={query.data ? (
        <>
          <Pill tone={saved.is_active ? 'success' : 'neutral'}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${saved.is_active ? 'bg-a-st-confirmed' : 'bg-a-text-2'}`} />
            {saved.is_active ? t('crm.widget.state_on', 'Shown on your website') : t('crm.widget.state_off', 'Switched off')}
          </Pill>
          {tab !== 'install' && (
            <Button variant="secondary" size="sm" onClick={() => choose('install')}><Code2 size={15} aria-hidden />{t('crm.widget.get_code', 'Get the code')}</Button>
          )}
        </>
      ) : undefined}>
      <SectionNav label={t('crm.widget.sections', 'Sections')} idPrefix={ID_PREFIX} panelId={PANEL_ID} sections={sections} value={tab} onChange={choose} />
      <div id={PANEL_ID} role="tabpanel" aria-labelledby={`${ID_PREFIX}-${tab}`} className="min-w-0">
        <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }}>
          <div className="space-y-4 animate-a-fade" key={tab}>
            {!canManage && tab !== 'install' && <ReadOnlyNote />}
            {tab === 'look' && <LookTab form={form} update={update} problems={problems} canManage={canManage} widgetKey={WIDGET_KEY}
              part={lookPart} onPart={choosePart(LOOK_PARTS) as (next: LookPart) => void} flagged={flagged} />}
            {tab === 'behaviour' && <BehaviourTab form={form} update={update} problems={problems} canManage={canManage} venueZone={boot.venue.timezone}
              part={chatPart} onPart={choosePart(CHAT_PARTS) as (next: ChatPart) => void} flagged={flagged} />}
            {tab === 'install' && <InstallTab active={saved.is_active} canManage={canManage} />}
            {canManage && tab !== 'install' && (
              <SaveBar dirty={dirty} valid={problems.length === 0} busy={save.isPending} onSave={() => save.mutate()} onDiscard={() => setDraft(null)} />
            )}
          </div>
        </QueryState>
      </div>
    </Page>
  )
}
