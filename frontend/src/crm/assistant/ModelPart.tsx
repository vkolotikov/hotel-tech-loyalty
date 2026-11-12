import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Loader2, Lock, Wifi } from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { AI_PROVIDERS, type Provider } from '../../lib/aiModels'
import { get, send } from '../lib/api'
import { IconButton } from '../ui/IconButton'
import { Select } from '../ui/inputs'
import { QueryState } from '../ui/QueryState'
import { PartCard, TipField } from '../settings/formKit'
import {
  REASONING_EFFORTS, VERBOSITIES, modelCapabilities, modelForm, modelOptions, modelPayload, modelProblems, probeState, sameModel,
  savedModelBlocked, switchProvider, type ModelConfig, type ModelForm, type ModelProblem, type ReasoningEffort, type Verbosity,
} from './modelLogic'
import { Disclosure, Problem } from './parts'
import { MODEL_KEY } from './queries'

export interface ModelFormState {
  query: UseQueryResult<ModelConfig>
  saved: ModelForm
  form: ModelForm
  allowed: string[] | null
  set: (patch: Partial<ModelForm>) => void
  replace: (next: ModelForm) => void
  dirty: boolean
  problems: ModelProblem[]
  save: () => Promise<unknown>
  saving: boolean
  discard: () => void
}

/** The model's form beside the behaviour's (one save bar saves both). */
export function useModelForm(): ModelFormState {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: MODEL_KEY, queryFn: () => get<ModelConfig>('chatbot-config/model') })
  const saved = useMemo(() => modelForm(query.data), [query.data])
  const allowed = Array.isArray(query.data?.allowed_models) ? query.data.allowed_models : null
  const [draft, setDraft] = useState<ModelForm | null>(null)
  const form = draft ?? saved
  const save = useMutation({
    mutationFn: () => send<ModelConfig>('put', 'chatbot-config/model', modelPayload(form)),
    onSuccess: data => {
      qc.setQueryData<ModelConfig>(MODEL_KEY, old => ({ ...(old ?? {}), ...(data ?? {}), allowed_models: old?.allowed_models ?? null }))
      setDraft(null)
    },
  })
  return {
    query,
    saved,
    form,
    allowed,
    set: patch => setDraft(prev => ({ ...(prev ?? saved), ...patch })),
    replace: next => setDraft(next),
    dirty: draft !== null && !sameModel(draft, saved),
    problems: modelProblems(form, saved, allowed),
    save: () => save.mutateAsync(),
    saving: save.isPending,
    discard: () => setDraft(null),
  }
}

/**
 * The AI model part of Behaviour (round 5; the full admin's ChatbotConfig.tsx "AI Model"): the provider and the model,
 * a check that the model answers on the AI account (probe-model, a manager's), and the fine-tuning the chosen model
 * takes. A model the plan does not include is marked and not offered; when the saved one is such a model, the page
 * says the assistant cannot answer with it.
 */
export function ModelPart({ model, canManage }: { model: ModelFormState; canManage: boolean }) {
  const { t } = useTranslation()
  const { form, saved, allowed } = model
  const probe = useMutation({
    mutationFn: (f: ModelForm) => send<{ available?: boolean }>('post', 'chatbot-config/probe-model', { provider: f.provider, model_name: f.model_name }),
  })
  const choice = `${form.provider}/${form.model_name}`
  const first = useRef(choice)
  const moved = useRef(false)
  // After the person picks another model, check it (half a second later, as the full admin does) — never on arrival.
  useEffect(() => {
    if (choice !== first.current) moved.current = true
    if (!moved.current || !canManage) return undefined
    probe.reset()
    const id = window.setTimeout(() => probe.mutate(form), 500)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice])
  const state = probe.isPending ? 'checking' : probeState(probe.data, probe.isError)
  const can = modelCapabilities(form)
  const options = modelOptions(form.provider, form.model_name, allowed)
  const limited = !!allowed && allowed.length > 0
  const blocked = savedModelBlocked(saved, allowed)
  const optionLabel = (o: (typeof options)[number]) => [
    `${o.label}${o.recommended ? ' ★' : ''}`,
    o.older ? t('crm.assistant.model.older', 'older, still works') : '',
    o.allowed ? '' : t('crm.assistant.model.not_in_plan_short', 'not in your plan'),
  ].filter(Boolean).join(' · ')

  const reasoningNames: Record<ReasoningEffort, string> = {
    none: t('crm.assistant.model.reasoning_none', 'None, fastest'),
    low: t('crm.assistant.model.reasoning_low', 'Low (best for chat)'),
    medium: t('crm.assistant.model.reasoning_medium', 'Medium'),
    high: t('crm.assistant.model.reasoning_high', 'High, slower'),
    xhigh: t('crm.assistant.model.reasoning_xhigh', 'Highest, slowest'),
  }
  const verbosityNames: Record<Verbosity, string> = {
    low: t('crm.assistant.model.verbosity_low', 'Short (best for chat)'),
    medium: t('crm.assistant.model.verbosity_medium', 'Balanced'),
    high: t('crm.assistant.model.verbosity_high', 'Thorough'),
  }

  return (
    <QueryState loading={model.query.isLoading} error={model.query.error} onRetry={() => { void model.query.refetch() }} rows={3}>
      <PartCard>
        {blocked && (
          <Notice tone="danger">
            <span className="flex items-start gap-2"><Lock size={15} aria-hidden className="mt-0.5 shrink-0" />
              {t('crm.assistant.model.blocked', 'Your plan does not include {{model}}, so the assistant cannot answer with it: every chat waits for your team. Choose a model your plan includes.', { model: saved.model_name })}
            </span>
          </Notice>
        )}
        <fieldset disabled={!canManage} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <TipField label={t('crm.assistant.model.provider', 'Provider')}>
            {id => (
              <Select id={id} value={form.provider} onChange={e => model.replace(switchProvider(form, e.target.value as Provider, allowed))}>
                {AI_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </Select>
            )}
          </TipField>
          <TipField label={t('crm.assistant.model.model', 'Model')}
            tip={limited
              ? `${t('crm.assistant.model.star', '★ is the one we recommend for a website chat.')} ${t('crm.assistant.model.plan_has', 'Your plan includes {{count}} models.', { count: allowed?.length ?? 0 })}`
              : t('crm.assistant.model.star', '★ is the one we recommend for a website chat.')}>
            {id => (
              <div className="flex items-center gap-1.5">
                <Select id={id} value={form.model_name} onChange={e => model.set({ model_name: e.target.value })}>
                  {options.map(o => <option key={o.id} value={o.id} disabled={!o.allowed && o.id !== saved.model_name}>{optionLabel(o)}</option>)}
                </Select>
                {canManage && (
                  <IconButton icon={Wifi} label={t('crm.assistant.model.check', 'Check that the model answers')} disabled={probe.isPending}
                    onClick={() => probe.mutate(form)} />
                )}
              </div>
            )}
          </TipField>
        </fieldset>
        {state !== 'idle' && (
          <p role="status" className={`flex items-center gap-1.5 text-sm ${state === 'ready' ? 'text-a-st-confirmed' : state === 'checking' ? 'text-a-text-2' : 'text-a-st-pending'}`}>
            {state === 'checking' && <><Loader2 size={14} aria-hidden className="animate-spin" />{t('crm.assistant.model.checking', 'Checking…')}</>}
            {state === 'ready' && <><CheckCircle2 size={14} aria-hidden />{t('crm.assistant.model.ready', 'It answers on the AI account.')}</>}
            {state === 'unavailable' && <><AlertTriangle size={14} aria-hidden />{t('crm.assistant.model.unavailable', 'It does not answer on the AI account yet. Choose another, or try again later.')}</>}
            {state === 'failed' && <><AlertTriangle size={14} aria-hidden />{t('crm.assistant.model.check_failed', 'The check did not get an answer. Try again.')}</>}
          </p>
        )}
        {model.problems.includes('not_in_plan') && <Problem>{t('crm.assistant.model.not_in_plan', 'Your plan does not include this model. Choose another.')}</Problem>}

        <Disclosure label={t('crm.assistant.model.tuning', 'Fine-tuning')}>
          <fieldset disabled={!canManage} className="grid min-w-0 gap-4 sm:grid-cols-2">
            {can.temperature ? (
              <TipField label={t('crm.assistant.model.temperature', 'Creativity: {{n}}', { n: form.temperature.toFixed(2) })}
                tip={t('crm.assistant.model.temperature_tip', 'Lower answers stick to the facts, higher ones vary more. 0.7 suits most venues.')}>
                {id => <input id={id} type="range" min={0} max={1} step={0.05} value={Math.min(1, form.temperature)} onChange={e => model.set({ temperature: Number(e.target.value) })} className="mt-2 w-full accent-a-accent-text" />}
              </TipField>
            ) : (
              <p className="self-center text-sm text-a-text-2">{t('crm.assistant.model.temperature_own', 'This model sets its own creativity.')}</p>
            )}
            <TipField label={t('crm.assistant.model.tokens', 'Longest reply: {{n}} tokens', { n: form.max_tokens })}
              tip={t('crm.assistant.model.tokens_tip', '1024 tokens are about 750 words.')}>
              {id => <input id={id} type="range" min={200} max={4096} step={128} value={Math.max(200, form.max_tokens)} onChange={e => model.set({ max_tokens: Number(e.target.value) })} className="mt-2 w-full accent-a-accent-text" />}
            </TipField>
            {can.reasoning && (
              <TipField label={t('crm.assistant.model.reasoning', 'Thinking before it answers')}
                tip={t('crm.assistant.model.reasoning_tip', 'More thinking is slower. Above none, the model sets its own creativity.')}>
                {id => (
                  <Select id={id} value={form.reasoning_effort} onChange={e => model.set({ reasoning_effort: e.target.value as ReasoningEffort })}>
                    {REASONING_EFFORTS.map(r => <option key={r} value={r}>{reasoningNames[r]}</option>)}
                  </Select>
                )}
              </TipField>
            )}
            {can.verbosity && (
              <TipField label={t('crm.assistant.model.verbosity', 'How much it says')}>
                {id => (
                  <Select id={id} value={form.verbosity} onChange={e => model.set({ verbosity: e.target.value as Verbosity })}>
                    {VERBOSITIES.map(v => <option key={v} value={v}>{verbosityNames[v]}</option>)}
                  </Select>
                )}
              </TipField>
            )}
          </fieldset>
        </Disclosure>
      </PartCard>
    </QueryState>
  )
}
