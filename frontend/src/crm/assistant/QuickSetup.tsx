import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { TextInput } from '../ui/inputs'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { activeRules, factKeys, factValue, missingFacts, quickSetupPayload, quickSetupProblems, toggleRule, type QuickSetupAnswers } from './onboarding'
import { Choice, Problem } from './parts'
import type { OnboardingResult, OnboardingState } from './types'

const ONBOARDING_KEY = ['crm', 'assistant', 'onboarding'] as const

/**
 * The assistant's first run (the full admin's quick setup, ChatbotOnboardingService): while the organisation has not
 * been through it, a card offers four short questions; the industry's preset fills in everything else. Managers only
 * (chatbot-onboarding is theirs to read and to write).
 */
export function QuickSetupCard() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [open, setOpen] = useState(false)
  const state = useQuery({ queryKey: ONBOARDING_KEY, queryFn: () => get<OnboardingState>('chatbot-onboarding'), retry: false, staleTime: 60_000 })
  const skip = useMutation({
    mutationFn: () => send('post', 'chatbot-onboarding/skip'),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ONBOARDING_KEY }) },
    onError: error => say(errorText(t, error), 'danger'),
  })

  if (!state.data || state.data.completed) return null

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-a-border bg-a-surface p-4 shadow-a-sm crm-ai-border sm:flex-row sm:flex-wrap sm:items-center">
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl crm-ai-soft"><Sparkles size={20} /></span>
      <div className="min-w-0 flex-1 sm:min-w-64">
        <h2 className="text-sm font-semibold text-a-text">{t('crm.assistant.quick.title', 'Set up the assistant in a minute')}</h2>
        <p className="text-sm text-a-text-2">{t('crm.assistant.quick.line', 'Four short questions. We fill in the rest for your kind of business, and you can change everything later.')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => skip.mutate()} loading={skip.isPending}>{t('crm.assistant.quick.skip', 'Not now')}</Button>
        <Button size="sm" onClick={() => setOpen(true)}>{t('crm.assistant.quick.start', 'Start the quick setup')}</Button>
      </div>
      {open && <QuickSetupPanel state={state.data} onClose={() => setOpen(false)} />}
    </section>
  )
}

function QuickSetupPanel({ state, onClose }: { state: OnboardingState; onClose: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const qc = useQueryClient()
  const say = useToast()
  const [answers, setAnswers] = useState<QuickSetupAnswers>({ facts: {}, handoff_whatsapp: '', handoff_email: '' })
  const problems = quickSetupProblems(answers)
  const missing = missingFacts(state, answers)
  const rules = activeRules(state, answers)
  const tone = answers.tone ?? state.preset.tone ?? 'friendly'

  const apply = useMutation({
    mutationFn: () => send<OnboardingResult>('post', 'chatbot-onboarding', quickSetupPayload(state, answers, boot.venue.timezone)),
    onSuccess: result => {
      for (const key of [ONBOARDING_KEY, ['crm', 'assistant', 'behaviour'], ['crm', 'assistant', 'knowledge'], ['crm', 'widget'], ['crm', 'start'], ['crm', 'bootstrap']]) {
        void qc.invalidateQueries({ queryKey: key })
      }
      say(result.knowledge_created > 0
        ? t('crm.assistant.quick.done_with', 'The assistant is set up, with {{count}} answers ready.', { count: result.knowledge_created })
        : t('crm.assistant.quick.done', 'The assistant is set up.'))
      onClose()
    },
    onError: error => say(errorText(t, error), 'danger'),
  })

  return (
    <SidePanel title={t('crm.assistant.quick.panel', 'Quick setup')} onClose={onClose}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={apply.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button onClick={() => apply.mutate()} loading={apply.isPending} disabled={problems.length > 0}><Sparkles size={15} aria-hidden />{t('crm.assistant.quick.finish', 'Finish setup')}</Button>
        </div>
      )}>
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-a-text">1. {t('crm.assistant.quick.step_name', 'Your assistant')}</h3>
          <Field label={t('crm.assistant.quick.name', 'What should it be called?')} hint={t('crm.assistant.quick.name_hint', 'Visitors see this name at the top of the chat.')}>
            <TextInput value={answers.assistant_name ?? state.preset.assistant_name ?? ''} maxLength={120}
              onChange={e => setAnswers(a => ({ ...a, assistant_name: e.target.value }))} />
          </Field>
          <Choice label={t('crm.assistant.quick.tone', 'How should it sound?')} value={tone} onChange={value => setAnswers(a => ({ ...a, tone: value }))}
            options={[
              { value: 'friendly', label: t('crm.assistant.tones.friendly', 'Friendly'), line: t('crm.assistant.quick.tone_friendly', 'Warm and chatty') },
              { value: 'professional', label: t('crm.assistant.tones.professional', 'Professional'), line: t('crm.assistant.quick.tone_professional', 'Polished and precise') },
              { value: 'casual', label: t('crm.assistant.tones.casual', 'Casual'), line: t('crm.assistant.quick.tone_casual', 'Relaxed and informal') },
              { value: 'formal', label: t('crm.assistant.tones.formal', 'Formal'), line: t('crm.assistant.quick.tone_formal', 'Reserved and correct') },
            ]} />
        </section>

        {factKeys(state).length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-a-text">2. {t('crm.assistant.quick.step_facts', 'What it knows')}</h3>
            <p className="text-sm text-a-text-2">{t('crm.assistant.quick.facts_line', 'These become ready answers. Leave one blank and the assistant offers to check instead of guessing.')}</p>
            {factKeys(state).map(key => {
              const fact = state.facts[key]
              return (
                <Field key={key} label={fact.required ? `${fact.label} *` : fact.label}>
                  <TextInput value={factValue(state, answers, key)} placeholder={fact.placeholder} maxLength={500}
                    onChange={e => setAnswers(a => ({ ...a, facts: { ...a.facts, [key]: e.target.value } }))} />
                </Field>
              )
            })}
          </section>
        )}

        {(state.preset.core_rules ?? []).length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-a-text">3. {t('crm.assistant.quick.step_rules', 'Ground rules')}</h3>
            <p className="text-sm text-a-text-2">{t('crm.assistant.quick.rules_line', 'Already set for your kind of business. Untick any that do not fit.')}</p>
            <ul className="space-y-2">
              {state.preset.core_rules.map(rule => (
                <li key={rule}>
                  <label className="flex cursor-pointer items-start gap-3 text-sm text-a-text">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-a-accent-text" checked={rules.includes(rule)}
                      onChange={() => setAnswers(a => ({ ...a, rules: toggleRule(state, a, rule) }))} />
                    <span>{rule}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-a-text">4. {t('crm.assistant.quick.step_person', 'Talk to a person')}</h3>
          <Field label={t('crm.assistant.quick.whatsapp', 'WhatsApp number')} hint={t('crm.assistant.quick.whatsapp_hint', 'With the country code. Adds a WhatsApp button to the chat.')}>
            <TextInput type="tel" value={answers.handoff_whatsapp} placeholder="+44 20 7123 4567" maxLength={32}
              onChange={e => setAnswers(a => ({ ...a, handoff_whatsapp: e.target.value }))} />
          </Field>
          {problems.includes('handoff_whatsapp') && <Problem>{t('crm.assistant.quick.whatsapp_bad', 'Use digits, spaces, + and brackets only (6 to 32).')}</Problem>}
          <Field label={t('crm.assistant.quick.email', 'Email us when someone needs help')} hint={t('crm.assistant.quick.email_hint', 'So a waiting visitor is not missed.')}>
            <TextInput type="email" value={answers.handoff_email} placeholder="team@example.com" maxLength={190}
              onChange={e => setAnswers(a => ({ ...a, handoff_email: e.target.value }))} />
          </Field>
          {problems.includes('handoff_email') && <Problem>{t('crm.assistant.quick.email_bad', 'This does not look like an email address.')}</Problem>}
        </section>

        {missing.length > 0 && (
          <Notice tone="warning">{t('crm.assistant.quick.missing', 'Still empty: {{facts}}. Visitors ask for these most; you can add them later in Knowledge.', { facts: missing.map(key => state.facts[key].label).join(', ') })}</Notice>
        )}
      </div>
    </SidePanel>
  )
}
