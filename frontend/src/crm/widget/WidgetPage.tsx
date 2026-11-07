import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../CrmProvider'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Page } from '../ui/Page'
import { QueryState } from '../ui/QueryState'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { BehaviourTab } from './BehaviourTab'
import { EMBED_KEY } from './embed'
import { InstallTab } from './InstallTab'
import { LookTab } from './LookTab'
import { ReadOnlyNote, SaveBar } from './parts'
import { WIDGET_KEY, WIDGET_TABS, pickTab, type WidgetTab } from './tabs'
import { sameWidget, widgetForm, widgetPayload, widgetProblems, type WidgetConfig, type WidgetForm } from './widgetForm'

const TAB_PARAM = 'tab'

/**
 * The chat widget (HexaTech CRM, 2026-11-07): how the website chat looks, how it behaves with a visitor, and how to
 * put it on the site — the full admin's widget settings on the same endpoints (widget-config). Look and Behaviour are
 * one form with one Save; Install reads the server's code. The section is kept in `?tab=` (Get started links to
 * `?tab=install`). Changes are a manager's (`staff.can.manage_widget`).
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

  const choose = (next: WidgetTab) => setParams(prev => {
    const out = new URLSearchParams(prev)
    if (next === 'look') out.delete(TAB_PARAM)
    else out.set(TAB_PARAM, next)
    return out
  }, { replace: true })

  return (
    <Page title={t('crm.nav.widget', 'Chat widget')} line={t('crm.widget.line', 'The chat on your website: how it looks, how it greets visitors, and how to put it on your site.')}
      below={(
        <Tabs label={t('crm.widget.sections', 'Sections')} value={tab} onChange={choose} items={[
          { key: 'look', label: t('crm.widget.tab.look', 'Look') },
          { key: 'behaviour', label: t('crm.widget.tab.behaviour', 'Behaviour') },
          { key: 'install', label: t('crm.widget.tab.install', 'Install') },
        ]} />
      )}>
      <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }}>
        <div className="space-y-5">
          {!canManage && tab !== 'install' && <ReadOnlyNote />}
          {tab === 'look' && <LookTab form={form} update={update} problems={problems} canManage={canManage} widgetKey={WIDGET_KEY} />}
          {tab === 'behaviour' && <BehaviourTab form={form} update={update} problems={problems} canManage={canManage} venueZone={boot.venue.timezone} />}
          {tab === 'install' && <InstallTab active={saved.is_active} canManage={canManage} />}
          {canManage && tab !== 'install' && (
            <SaveBar dirty={dirty} valid={problems.length === 0} busy={save.isPending} onSave={() => save.mutate()} onDiscard={() => setDraft(null)} />
          )}
        </div>
      </QueryState>
    </Page>
  )
}
