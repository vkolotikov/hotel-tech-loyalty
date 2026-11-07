import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Eye, MousePointerClick, Pencil, Plus, Trash2, Zap } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { get, send } from '../lib/api'
import { count } from '../lib/format'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { Select, TextArea, TextInput, Toggle } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { CharCount, ChipEditor, Choice, InlineSwitch, Problem, ReadOnlyNote } from './parts'
import {
  POPUP_LIMITS, popupForm, popupPayload, popupProblems, triggerOptions, triggerTakesValue, triggerText, urlMatchOptions,
  visitorOptions, type PopupForm,
} from './popups'
import { POPUPS_KEY } from './queries'
import type { PopupRule } from './types'

/**
 * Pop-ups (popup-rules): the chat opens by itself with a message — when a page opens, after some seconds, part way
 * down, or as the visitor is about to leave — on the pages and for the visitors a rule names. A manager's to change.
 */
export function PopupsTab({ canManage }: { canManage: boolean }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const rules = useQuery({ queryKey: POPUPS_KEY, queryFn: () => get<PopupRule[]>('popup-rules') })
  const [editing, setEditing] = useState<PopupRule | 'new' | null>(null)
  const [deleting, setDeleting] = useState<PopupRule | null>(null)
  const toggle = useMutation({
    mutationFn: (rule: PopupRule) => send('put', `popup-rules/${rule.id}`, { is_active: !rule.is_active }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: POPUPS_KEY }) },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const remove = useMutation({
    mutationFn: (rule: PopupRule) => send('delete', `popup-rules/${rule.id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: POPUPS_KEY }); setDeleting(null); say(t('crm.assistant.knowledge.deleted', 'Deleted')) },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const visitors = Object.fromEntries(visitorOptions(t).map(o => [o.value, o.label]))
  const matches = Object.fromEntries(urlMatchOptions(t).map(o => [o.value, o.label]))

  return (
    <QueryState loading={rules.isLoading} error={rules.error} onRetry={() => { void rules.refetch() }}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-a-text-2">{t('crm.assistant.popups.line', 'Open the chat by itself with a message, on the pages you choose. The rule with the highest priority wins.')}</p>
          {canManage && <Button onClick={() => setEditing('new')}><Plus size={15} aria-hidden />{t('crm.assistant.popups.add', 'Add a pop-up')}</Button>}
        </div>
        {!canManage && <ReadOnlyNote />}
        <Card padded={false}>
          {(rules.data ?? []).length === 0 ? (
            <EmptyState icon={Zap} title={t('crm.assistant.popups.empty', 'No pop-ups yet')}
              line={t('crm.assistant.popups.empty_line', 'e.g. after 20 seconds on your prices page: "Questions about a stay? I can help."')}
              action={canManage ? <Button onClick={() => setEditing('new')}><Plus size={15} aria-hidden />{t('crm.assistant.popups.add', 'Add a pop-up')}</Button> : undefined} />
          ) : (
            <ul className="divide-y divide-a-border">
              {(rules.data ?? []).map(rule => (
                <li key={rule.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-a-text">
                      {rule.name}
                      <Pill tone="accent">{triggerText(t, rule.trigger_type, rule.trigger_value)}</Pill>
                      {!rule.is_active && <Pill tone="danger">{t('crm.assistant.popups.off', 'Off')}</Pill>}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-a-text-2">{rule.message}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-a-text-2">
                      {rule.url_match_value && <span>{matches[rule.url_match_type ?? 'contains']} “{rule.url_match_value}”</span>}
                      <span>{visitors[rule.visitor_type ?? 'all']}</span>
                      <span className="inline-flex items-center gap-1" title={t('crm.assistant.popups.shown', 'Shown')}><Eye size={12} aria-hidden /><span className="sr-only">{t('crm.assistant.popups.shown', 'Shown')}</span>{count(rule.impressions_count ?? 0, i18n.language)}</span>
                      <span className="inline-flex items-center gap-1" title={t('crm.assistant.popups.clicked', 'Clicked')}><MousePointerClick size={12} aria-hidden /><span className="sr-only">{t('crm.assistant.popups.clicked', 'Clicked')}</span>{count(rule.clicks_count ?? 0, i18n.language)}</span>
                      <span>{t('crm.assistant.popups.priority_n', 'Priority {{n}}', { n: rule.priority })}</span>
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <InlineSwitch label={t('crm.assistant.popups.on_named', '{{name}} is on', { name: rule.name })} checked={rule.is_active} disabled={toggle.isPending} onChange={() => toggle.mutate(rule)} />
                      <button type="button" onClick={() => setEditing(rule)} aria-label={t('crm.assistant.popups.edit', 'Edit {{name}}', { name: rule.name })}
                        className="rounded-full p-2 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent"><Pencil size={15} aria-hidden /></button>
                      <button type="button" onClick={() => setDeleting(rule)} aria-label={t('crm.assistant.popups.delete', 'Delete {{name}}', { name: rule.name })}
                        className="rounded-full p-2 text-a-text-2 hover:bg-a-surface-2 hover:text-a-danger focus-visible:outline-2 focus-visible:outline-a-accent"><Trash2 size={15} aria-hidden /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {editing && <PopupPanel rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
        {deleting && (
          <Confirm title={t('crm.assistant.popups.delete_title', 'Delete the pop-up {{name}}?', { name: deleting.name })} confirm={t('crm.common.delete', 'Delete')}
            busy={remove.isPending} onConfirm={() => remove.mutate(deleting)} onClose={() => setDeleting(null)}>
            {t('crm.assistant.popups.delete_line', 'It stops showing on your website, and its figures go with it.')}
          </Confirm>
        )}
      </div>
    </QueryState>
  )
}

function PopupPanel({ rule, onClose }: { rule: PopupRule | null; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [form, setForm] = useState<PopupForm>(() => popupForm(rule))
  const [tried, setTried] = useState(false)
  const problems = popupProblems(form)
  const set = <K extends keyof PopupForm>(key: K, value: PopupForm[K]) => setForm(f => ({ ...f, [key]: value }))
  const save = useMutation({
    mutationFn: () => rule ? send('put', `popup-rules/${rule.id}`, popupPayload(form)) : send('post', 'popup-rules', popupPayload(form)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: POPUPS_KEY }); say(t('crm.common.saved', 'Saved')); onClose() },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const submit = () => { setTried(true); if (problems.length === 0) save.mutate() }

  return (
    <SidePanel title={rule ? t('crm.assistant.popups.edit_title', 'Edit the pop-up') : t('crm.assistant.popups.new_title', 'New pop-up')} onClose={onClose}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button onClick={submit} loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
        </div>
      )}>
      <div className="space-y-5">
        <div>
          <Field label={t('crm.assistant.popups.name', 'Name (for you)')}>
            <TextInput value={form.name} maxLength={POPUP_LIMITS.name} placeholder={t('crm.assistant.popups.name_placeholder', 'e.g. Prices page')} onChange={e => set('name', e.target.value)} />
          </Field>
          {tried && problems.includes('name') && <Problem>{t('crm.assistant.popups.name_required', 'Give the pop-up a name.')}</Problem>}
        </div>
        <Choice label={t('crm.assistant.popups.when', 'When it opens')} value={form.trigger_type} options={triggerOptions(t)}
          onChange={value => setForm(f => ({ ...f, trigger_type: value, trigger_value: value === 'scroll_depth' ? '50' : value === 'time_delay' ? '5' : '' }))} />
        {triggerTakesValue(form.trigger_type) && (
          <div>
            <Field label={form.trigger_type === 'time_delay' ? t('crm.assistant.popups.seconds', 'Seconds after the page opens') : t('crm.assistant.popups.percent', 'How far down the page (%)')}>
              <TextInput type="number" inputMode="numeric" min={0} max={form.trigger_type === 'scroll_depth' ? 100 : 3600} className="max-w-40"
                value={form.trigger_value} onChange={e => set('trigger_value', e.target.value)} />
            </Field>
            {problems.includes('value') && <Problem>{form.trigger_type === 'time_delay'
              ? t('crm.assistant.popups.seconds_bad', 'A number of seconds from 0 to 3600.')
              : t('crm.assistant.popups.percent_bad', 'A number from 0 to 100.')}</Problem>}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('crm.assistant.popups.pages', 'On which pages')}>
            <Select value={form.url_match_type} onChange={e => set('url_match_type', e.target.value as PopupForm['url_match_type'])}>
              {urlMatchOptions(t).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label={t('crm.assistant.popups.address', 'Address')} hint={t('crm.assistant.popups.address_hint', 'Empty: every page.')}>
            <TextInput value={form.url_match_value} maxLength={POPUP_LIMITS.url} placeholder="/prices" onChange={e => set('url_match_value', e.target.value)} />
          </Field>
        </div>
        <Field label={t('crm.assistant.popups.who', 'For whom')}>
          <Select value={form.visitor_type} onChange={e => set('visitor_type', e.target.value as PopupForm['visitor_type'])}>
            {visitorOptions(t).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <div>
          <Field label={t('crm.assistant.popups.message', 'Message')}>
            <TextArea rows={3} value={form.message} placeholder={t('crm.assistant.popups.message_placeholder', 'Questions about a stay? I can help.')} onChange={e => set('message', e.target.value)} />
          </Field>
          <CharCount value={form.message} max={POPUP_LIMITS.message} />
          {tried && problems.includes('message') && <Problem>{t('crm.assistant.popups.message_required', 'Write the message the chat opens with.')}</Problem>}
        </div>
        <ChipEditor label={t('crm.assistant.popups.replies', 'Buttons under the message')} items={form.quick_replies} max={POPUP_LIMITS.reply}
          placeholder={t('crm.assistant.popups.reply_placeholder', 'e.g. See prices')} onChange={next => set('quick_replies', next)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('crm.assistant.knowledge.priority', 'Priority')} hint={t('crm.assistant.popups.priority_hint', 'Higher wins when two rules fit a page.')}>
            <TextInput type="number" min={0} inputMode="numeric" value={form.priority} onChange={e => set('priority', e.target.value)} />
          </Field>
        </div>
        <Toggle label={t('crm.assistant.popups.active', 'This pop-up is on')} checked={form.is_active} onChange={on => set('is_active', on)} />
        {problems.includes('too_long') && <Problem>{t('crm.assistant.popups.too_long', 'A text is longer than allowed.')}</Problem>}
      </div>
    </SidePanel>
  )
}
