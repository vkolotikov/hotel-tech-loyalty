import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LifeBuoy, ListChecks, MessageSquareQuote, Plus, Power, Settings2, Trash2, UserRound } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Select, TextArea, TextInput, Toggle } from '../ui/inputs'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import {
  BEHAVIOUR_LIMITS, LANGUAGES, behaviourForm, behaviourPayload, behaviourProblems, behaviourValid, languageName,
  replyLengthOptions, salesStyleOptions, sameBehaviour, toneOptions, type BehaviourForm,
} from './behaviour'
import { addText, removeAt } from './lists'
import { CharCount, Choice, Disclosure, Problem, ReadOnlyNote, SaveBar } from './parts'
import { BEHAVIOUR_KEY } from './queries'
import { QuickSetupCard } from './QuickSetup'
import type { BehaviourConfig } from './types'

/**
 * How the assistant behaves (chatbot-config/behavior), as titled cards of related fields: on the website, who it is,
 * how it talks, the rules it keeps, when it hands over, and the rare extra instructions folded away — with one save
 * bar that shows only while something changed. The model settings stay in the full admin. A manager's to change.
 */
export function BehaviourTab({ canManage }: { canManage: boolean }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const query = useQuery({ queryKey: BEHAVIOUR_KEY, queryFn: () => get<BehaviourConfig>('chatbot-config/behavior') })
  const saved = useMemo(() => behaviourForm(query.data), [query.data])
  const [draft, setDraft] = useState<BehaviourForm | null>(null)
  const [newRule, setNewRule] = useState('')
  const form = draft ?? saved
  const dirty = draft !== null && !sameBehaviour(draft, saved)
  const problems = behaviourProblems(form)
  const tooLong = (field: (typeof problems.fields)[number]) => problems.fields.includes(field)
    ? <Problem>{t('crm.assistant.too_long', 'Too long: at most {{max}} characters.', { max: BEHAVIOUR_LIMITS[field] })}</Problem>
    : null

  const set = <K extends keyof BehaviourForm>(key: K, value: BehaviourForm[K]) => setDraft(prev => ({ ...(prev ?? saved), [key]: value }))
  const addRule = () => { set('core_rules', addText(form.core_rules, newRule, BEHAVIOUR_LIMITS.rule)); setNewRule('') }

  const save = useMutation({
    mutationFn: () => send<BehaviourConfig>('put', 'chatbot-config/behavior', behaviourPayload(form)),
    onSuccess: data => {
      qc.setQueryData(BEHAVIOUR_KEY, data)
      setDraft(null)
      void qc.invalidateQueries({ queryKey: ['crm', 'start'] })
      void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
      say(t('crm.assistant.behaviour.saved', 'Saved. The assistant answers this way from the next message.'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })

  return (
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }}>
      <div className="space-y-5">
        {canManage ? <QuickSetupCard /> : <ReadOnlyNote />}
        <fieldset disabled={!canManage} className="grid min-w-0 gap-5 lg:grid-cols-2">
          <Card className="lg:col-span-2" title={t('crm.assistant.behaviour.on_title', 'On the website')} icon={Power} tone={form.is_active ? 'success' : 'neutral'}
            description={t('crm.assistant.behaviour.on_line', 'Whether visitors get answers from the assistant.')}>
            <Toggle label={t('crm.assistant.behaviour.active', 'The assistant answers visitors')} checked={form.is_active} disabled={!canManage}
              hint={t('crm.assistant.behaviour.active_hint', 'Switched off, every chat waits for a person in the inbox.')}
              onChange={on => set('is_active', on)} />
          </Card>

          <Card title={t('crm.assistant.behaviour.who_title', 'Who it is')} icon={UserRound} tone="ai"
            description={t('crm.assistant.behaviour.who_line', 'Its name, its language and what it is there for.')}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Field label={t('crm.assistant.behaviour.name', 'Name')}>
                    <TextInput value={form.assistant_name} placeholder={t('crm.assistant.behaviour.name_placeholder', 'e.g. Ava')} onChange={e => set('assistant_name', e.target.value)} />
                  </Field>
                  {tooLong('assistant_name')}
                </div>
                <Field label={t('crm.assistant.behaviour.language', 'Reply language')}>
                  <Select value={form.language} onChange={e => set('language', e.target.value)}>
                    {!(LANGUAGES as readonly string[]).includes(form.language) && <option value={form.language}>{languageName(form.language, i18n.language)}</option>}
                    {LANGUAGES.map(code => (
                      <option key={code} value={code}>{code === 'auto' ? t('crm.assistant.behaviour.language_auto', 'The visitor\'s language') : languageName(code, i18n.language)}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div>
                <Field label={t('crm.assistant.behaviour.identity', 'Who it is, in a few sentences')} hint={t('crm.assistant.behaviour.identity_hint', 'Written to the assistant: "You are the friendly host of…". Empty, it introduces itself by its name.')}>
                  <TextArea rows={4} value={form.identity} onChange={e => set('identity', e.target.value)} />
                </Field>
                <CharCount value={form.identity} max={BEHAVIOUR_LIMITS.identity} />
                {tooLong('identity')}
              </div>
              <div>
                <Field label={t('crm.assistant.behaviour.goal', 'Its goal')} hint={t('crm.assistant.behaviour.goal_hint', 'What a good chat ends with, e.g. a booking request or a visitor\'s email.')}>
                  <TextArea rows={3} value={form.goal} onChange={e => set('goal', e.target.value)} />
                </Field>
                <CharCount value={form.goal} max={BEHAVIOUR_LIMITS.goal} />
                {tooLong('goal')}
              </div>
            </div>
          </Card>

          <Card title={t('crm.assistant.behaviour.style_title', 'How it talks')} icon={MessageSquareQuote} tone="accent"
            description={t('crm.assistant.behaviour.style_line', 'How much it sells, its tone and how long its replies are.')}>
            <div className="space-y-4">
              <Choice label={t('crm.assistant.behaviour.sales', 'Selling')} value={form.sales_style} options={salesStyleOptions(t)}
                onChange={value => set('sales_style', value)} disabled={!canManage} columns="sm:grid-cols-2" />
              <Field label={t('crm.assistant.behaviour.tone', 'Tone')}>
                <Select value={form.tone} onChange={e => set('tone', e.target.value as BehaviourForm['tone'])}>
                  {toneOptions(t).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Choice label={t('crm.assistant.behaviour.length', 'Reply length')} value={form.reply_length} options={replyLengthOptions(t)}
                onChange={value => set('reply_length', value)} disabled={!canManage} columns="grid-cols-3" />
            </div>
          </Card>

          <Card title={t('crm.assistant.behaviour.rules_title', 'What it may promise')} icon={ListChecks} tone="pending"
            description={t('crm.assistant.behaviour.rules_card_line', 'Rules it always keeps, whatever a visitor asks.')}>
            <div className="space-y-3">
              <p className="text-sm text-a-text-2">{t('crm.assistant.behaviour.rules_line', 'Short and firm: "Never promise a price that is not in your answers."')}</p>
              {form.core_rules.length === 0 && <p className="rounded-xl border border-dashed border-a-border px-3 py-4 text-center text-sm text-a-text-2">{t('crm.assistant.behaviour.no_rules', 'No rules yet.')}</p>}
              <ol className="space-y-2">
                {form.core_rules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span aria-hidden className="mt-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-a-surface-2 text-xs font-semibold text-a-text-2">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <label>
                        <span className="sr-only">{t('crm.assistant.behaviour.rule_n', 'Rule {{n}}', { n: i + 1 })}</span>
                        <TextInput value={rule} onChange={e => set('core_rules', form.core_rules.map((r, j) => (j === i ? e.target.value : r)))} />
                      </label>
                      {problems.rules.includes(i) && <Problem>{t('crm.assistant.too_long', 'Too long: at most {{max}} characters.', { max: BEHAVIOUR_LIMITS.rule })}</Problem>}
                    </div>
                    {canManage && (
                      <button type="button" onClick={() => set('core_rules', removeAt(form.core_rules, i))} aria-label={t('crm.assistant.behaviour.remove_rule', 'Remove rule {{n}}', { n: i + 1 })}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-danger focus-visible:outline-2 focus-visible:outline-a-accent"><Trash2 size={15} aria-hidden /></button>
                    )}
                  </li>
                ))}
              </ol>
              {canManage && (
                <div className="flex gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">{t('crm.assistant.behaviour.new_rule', 'A new rule')}</span>
                    <TextInput value={newRule} maxLength={BEHAVIOUR_LIMITS.rule} placeholder={t('crm.assistant.behaviour.new_rule', 'A new rule')}
                      onChange={e => setNewRule(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRule() } }} />
                  </label>
                  <Button type="button" variant="secondary" size="sm" disabled={!newRule.trim()} onClick={addRule}>
                    <Plus size={14} aria-hidden />{t('crm.common.add', 'Add')}
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card title={t('crm.assistant.behaviour.help_title', 'When to hand over')} icon={LifeBuoy} tone="danger"
            description={t('crm.assistant.behaviour.help_line', 'When a person takes over, and what it says if it cannot help.')}>
            <div className="space-y-4">
              <div>
                <Field label={t('crm.assistant.behaviour.escalation', 'When to hand over to a person')} hint={t('crm.assistant.behaviour.escalation_hint', 'e.g. "When someone asks for a person or a refund, offer to pass the chat to the team."')}>
                  <TextArea rows={4} value={form.escalation_policy} onChange={e => set('escalation_policy', e.target.value)} />
                </Field>
                <CharCount value={form.escalation_policy} max={BEHAVIOUR_LIMITS.escalation_policy} />
                {tooLong('escalation_policy')}
              </div>
              <div>
                <Field label={t('crm.assistant.behaviour.fallback', 'What it says when something goes wrong')}>
                  <TextInput value={form.fallback_message} placeholder={t('crm.assistant.behaviour.fallback_placeholder', 'Sorry, I could not answer that. Our team will reply here shortly.')}
                    onChange={e => set('fallback_message', e.target.value)} />
                </Field>
                {tooLong('fallback_message')}
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-2" title={t('crm.assistant.behaviour.more_title', 'More options')} icon={Settings2}
            description={t('crm.assistant.behaviour.more_line', 'Rarely needed: instructions beyond the fields above.')}>
            <Disclosure label={t('crm.assistant.behaviour.custom', 'Anything else it should know')} open={!canManage || saved.custom_instructions.trim() !== ''}
              line={t('crm.assistant.behaviour.custom_hint', 'Extra instructions, added to the end of what the assistant is told.')}>
              <div>
                <label className="block">
                  <span className="sr-only">{t('crm.assistant.behaviour.custom', 'Anything else it should know')}</span>
                  <TextArea rows={5} value={form.custom_instructions} onChange={e => set('custom_instructions', e.target.value)} />
                </label>
                <CharCount value={form.custom_instructions} max={BEHAVIOUR_LIMITS.custom_instructions} />
                {tooLong('custom_instructions')}
              </div>
            </Disclosure>
          </Card>
        </fieldset>
        {canManage && (
          <SaveBar dirty={dirty} valid={behaviourValid(form)} busy={save.isPending} onSave={() => save.mutate()} onDiscard={() => setDraft(null)} />
        )}
      </div>
    </QueryState>
  )
}
