import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Cpu, LifeBuoy, ListChecks, MessageSquareQuote, Plus, Power, Settings2, Trash2, UserRound } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { PartCard, PartHeading, SectionedForm, TipField, TipToggle, type FormPart } from '../settings/formKit'
import { flaggedParts } from '../settings/sectionLogic'
import {
  BEHAVIOUR_LIMITS, LANGUAGES, behaviourForm, behaviourPayload, behaviourProblems, behaviourValid, languageName,
  replyLengthOptions, salesStyleOptions, sameBehaviour, toneOptions, type BehaviourForm,
} from './behaviour'
import { addText, behaviourPartOf, removeAt, type BehaviourField, type BehaviourPart } from './lists'
import { ModelPart } from './ModelPart'
import { useModelForm } from './useModelForm'
import { CharCount, Choice, Problem, ReadOnlyNote, SaveBar } from './parts'
import { BEHAVIOUR_KEY } from './queries'
import { QuickSetupCard } from './QuickSetup'
import type { BehaviourConfig } from './types'

/**
 * How the assistant behaves (chatbot-config/behavior) and which AI model it answers with (chatbot-config/model), in
 * seven parts the person moves between (round 5, owner 2026-11-12: "tabs, not long scrolls"): the basics, who it is,
 * how it talks, its rules, when it hands over, the AI model, and the rare extra instructions — with one save bar for
 * both forms that shows only while something changed. A manager's to change.
 */
export function BehaviourTab({ canManage, part, onPart }: { canManage: boolean; part: BehaviourPart; onPart: (next: BehaviourPart) => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const query = useQuery({ queryKey: BEHAVIOUR_KEY, queryFn: () => get<BehaviourConfig>('chatbot-config/behavior') })
  const saved = useMemo(() => behaviourForm(query.data), [query.data])
  const [draft, setDraft] = useState<BehaviourForm | null>(null)
  const [newRule, setNewRule] = useState('')
  const model = useModelForm()
  const form = draft ?? saved
  const behaviourDirty = draft !== null && !sameBehaviour(draft, saved)
  const problems = behaviourProblems(form)
  const tooLong = (field: (typeof problems.fields)[number]) => problems.fields.includes(field)
    ? <Problem>{t('crm.assistant.too_long', 'Too long: at most {{max}} characters.', { max: BEHAVIOUR_LIMITS[field] })}</Problem>
    : null

  const set = <K extends keyof BehaviourForm>(key: K, value: BehaviourForm[K]) => setDraft(prev => ({ ...(prev ?? saved), [key]: value }))
  const addRule = () => { set('core_rules', addText(form.core_rules, newRule, BEHAVIOUR_LIMITS.rule)); setNewRule('') }

  const saveBehaviour = useMutation({
    mutationFn: () => send<BehaviourConfig>('put', 'chatbot-config/behavior', behaviourPayload(form)),
    onSuccess: data => {
      qc.setQueryData(BEHAVIOUR_KEY, data)
      setDraft(null)
      void qc.invalidateQueries({ queryKey: ['crm', 'start'] })
      void qc.invalidateQueries({ queryKey: ['crm', 'bootstrap'] })
    },
  })
  const saveAll = async () => {
    try {
      await Promise.all([
        behaviourDirty ? saveBehaviour.mutateAsync() : Promise.resolve(),
        model.dirty ? model.save() : Promise.resolve(),
      ])
      say(t('crm.assistant.behaviour.saved', 'Saved. The assistant answers this way from the next message.'))
    } catch (error) {
      say(errorText(t, error), 'danger')
    }
  }
  const discard = () => { setDraft(null); model.discard() }

  const fields: BehaviourField[] = [...problems.fields, ...(problems.rules.length ? ['rule' as const] : []), ...(model.problems.length ? ['model' as const] : [])]
  const flagged = flaggedParts(fields, behaviourPartOf)
  const parts = ([
    { key: 'basics', icon: Power, tone: form.is_active ? 'success' : 'neutral', title: t('crm.assistant.part.basics', 'Basics') },
    { key: 'identity', icon: UserRound, tone: 'ai', title: t('crm.assistant.part.identity', 'Who it is') },
    { key: 'style', icon: MessageSquareQuote, tone: 'accent', title: t('crm.assistant.part.style', 'How it talks') },
    { key: 'rules', icon: ListChecks, tone: 'pending', title: t('crm.assistant.part.rules', 'Rules'), badge: form.core_rules.length },
    { key: 'handover', icon: LifeBuoy, tone: 'danger', title: t('crm.assistant.part.handover', 'Hand over') },
    { key: 'model', icon: Cpu, tone: 'progress', title: t('crm.assistant.part.model', 'AI model') },
    { key: 'more', icon: Settings2, tone: 'neutral', title: t('crm.assistant.part.more', 'More') },
  ] as FormPart<BehaviourPart>[]).map(p => ({ ...p, flagged: flagged.has(p.key) }))

  return (
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }}>
      <div className="space-y-4">
        {canManage ? <QuickSetupCard /> : <ReadOnlyNote />}
        <SectionedForm label={t('crm.assistant.behaviour.parts', 'Parts of the behaviour')} idPrefix="assistant-behaviour" parts={parts} value={part} onChange={onPart}>
          {part === 'model' ? <ModelPart model={model} canManage={canManage} /> : (
            <fieldset disabled={!canManage} className="min-w-0">
              {part === 'basics' && (
                <PartCard>
                  <TipToggle label={t('crm.assistant.behaviour.active', 'The assistant answers visitors')} checked={form.is_active} disabled={!canManage}
                    tip={t('crm.assistant.behaviour.active_hint', 'Switched off, every chat waits for a person in the inbox.')}
                    onChange={on => set('is_active', on)} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <TipField label={t('crm.assistant.behaviour.name', 'Name')}>
                        {id => <TextInput id={id} value={form.assistant_name} placeholder={t('crm.assistant.behaviour.name_placeholder', 'e.g. Ava')} onChange={e => set('assistant_name', e.target.value)} />}
                      </TipField>
                      {tooLong('assistant_name')}
                    </div>
                    <TipField label={t('crm.assistant.behaviour.language', 'Reply language')}>
                      {id => (
                        <Select id={id} value={form.language} onChange={e => set('language', e.target.value)}>
                          {!(LANGUAGES as readonly string[]).includes(form.language) && <option value={form.language}>{languageName(form.language, i18n.language)}</option>}
                          {LANGUAGES.map(code => (
                            <option key={code} value={code}>{code === 'auto' ? t('crm.assistant.behaviour.language_auto', 'The visitor\'s language') : languageName(code, i18n.language)}</option>
                          ))}
                        </Select>
                      )}
                    </TipField>
                  </div>
                </PartCard>
              )}

              {part === 'identity' && (
                <PartCard>
                  <div>
                    <TipField label={t('crm.assistant.behaviour.identity', 'Who it is, in a few sentences')} tip={t('crm.assistant.behaviour.identity_hint', 'Written to the assistant: "You are the friendly host of…". Empty, it introduces itself by its name.')}>
                      {id => <TextArea id={id} rows={5} value={form.identity} onChange={e => set('identity', e.target.value)} />}
                    </TipField>
                    <CharCount value={form.identity} max={BEHAVIOUR_LIMITS.identity} />
                    {tooLong('identity')}
                  </div>
                  <div>
                    <TipField label={t('crm.assistant.behaviour.goal', 'Its goal')} tip={t('crm.assistant.behaviour.goal_hint', 'What a good chat ends with, e.g. a booking request or a visitor\'s email.')}>
                      {id => <TextArea id={id} rows={3} value={form.goal} onChange={e => set('goal', e.target.value)} />}
                    </TipField>
                    <CharCount value={form.goal} max={BEHAVIOUR_LIMITS.goal} />
                    {tooLong('goal')}
                  </div>
                </PartCard>
              )}

              {part === 'style' && (
                <PartCard>
                  <Choice label={t('crm.assistant.behaviour.sales', 'Selling')} value={form.sales_style} options={salesStyleOptions(t)}
                    onChange={value => set('sales_style', value)} disabled={!canManage} columns="sm:grid-cols-2" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TipField label={t('crm.assistant.behaviour.tone', 'Tone')}>
                      {id => (
                        <Select id={id} value={form.tone} onChange={e => set('tone', e.target.value as BehaviourForm['tone'])}>
                          {toneOptions(t).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      )}
                    </TipField>
                    <Choice label={t('crm.assistant.behaviour.length', 'Reply length')} value={form.reply_length} options={replyLengthOptions(t)}
                      onChange={value => set('reply_length', value)} disabled={!canManage} columns="grid-cols-3" />
                  </div>
                </PartCard>
              )}

              {part === 'rules' && (
                <PartCard>
                  <PartHeading title={t('crm.assistant.behaviour.rules_title', 'What it may promise')}
                    tip={`${t('crm.assistant.behaviour.rules_card_line', 'Rules it always keeps, whatever a visitor asks.')} ${t('crm.assistant.behaviour.rules_line', 'Short and firm: "Never promise a price that is not in your answers."')}`} />
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
                </PartCard>
              )}

              {part === 'handover' && (
                <PartCard>
                  <div>
                    <TipField label={t('crm.assistant.behaviour.escalation', 'When to hand over to a person')} tip={t('crm.assistant.behaviour.escalation_hint', 'e.g. "When someone asks for a person or a refund, offer to pass the chat to the team."')}>
                      {id => <TextArea id={id} rows={4} value={form.escalation_policy} onChange={e => set('escalation_policy', e.target.value)} />}
                    </TipField>
                    <CharCount value={form.escalation_policy} max={BEHAVIOUR_LIMITS.escalation_policy} />
                    {tooLong('escalation_policy')}
                  </div>
                  <div>
                    <TipField label={t('crm.assistant.behaviour.fallback', 'What it says when something goes wrong')}>
                      {id => <TextInput id={id} value={form.fallback_message} placeholder={t('crm.assistant.behaviour.fallback_placeholder', 'Sorry, I could not answer that. Our team will reply here shortly.')}
                        onChange={e => set('fallback_message', e.target.value)} />}
                    </TipField>
                    {tooLong('fallback_message')}
                  </div>
                </PartCard>
              )}

              {part === 'more' && (
                <PartCard>
                  <div>
                    <TipField label={t('crm.assistant.behaviour.custom', 'Anything else it should know')} tip={t('crm.assistant.behaviour.custom_hint', 'Extra instructions, added to the end of what the assistant is told.')}>
                      {id => <TextArea id={id} rows={6} value={form.custom_instructions} onChange={e => set('custom_instructions', e.target.value)} />}
                    </TipField>
                    <CharCount value={form.custom_instructions} max={BEHAVIOUR_LIMITS.custom_instructions} />
                    {tooLong('custom_instructions')}
                  </div>
                </PartCard>
              )}
            </fieldset>
          )}
        </SectionedForm>
        {canManage && (
          <SaveBar dirty={behaviourDirty || model.dirty} valid={behaviourValid(form) && model.problems.length === 0}
            busy={saveBehaviour.isPending || model.saving} onSave={() => { void saveAll() }} onDiscard={discard} />
        )}
      </div>
    </QueryState>
  )
}
