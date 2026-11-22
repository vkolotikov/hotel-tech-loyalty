import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Check, FileText, Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Pill } from '../ui/Pill'
import { effectiveValue, FIELD_STEPS, missingSuggestions, type Capture, type Evidence, type Fields, type FieldStep, type Profile } from './salesWizard'

export function SalesWizardReview({ profile, draft, capture, captureId, canEdit, onApply, onEdit }: {
  profile: Profile
  draft: Fields
  capture: Capture | null | undefined
  captureId?: string
  canEdit: boolean
  onApply: (fields: Fields, captureId: string) => void
  onEdit: (step: FieldStep) => void
}) {
  const { t } = useTranslation()
  const suggestions = capture?.status === 'ready' && canEdit ? capture.fields ?? {} : {}
  const blanks = missingSuggestions(profile, draft, suggestions)
  const pending = Object.entries(suggestions).filter(([key, suggestion]) => suggestion.value !== effectiveValue(profile, draft, key))
  return (
    <div className="space-y-5">
      {pending.length > 0 && capture && (
        <section className="crm-ai-border overflow-hidden rounded-xl border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-a-border bg-a-surface-2 p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-a-text">
              <Sparkles size={16} className="crm-ai-text" aria-hidden />{t('crm.wizard.suggestion_count', { count: pending.length })}
            </h3>
            {Object.keys(blanks).length > 0 && (
              <Button type="button" size="sm" variant="secondary" onClick={() => onApply(blanks, capture.id)}>
                {t('crm.wizard.fill_empty')}
              </Button>
            )}
          </div>
          <div className="divide-y divide-a-border">
            {pending.map(([key, suggestion]) => {
              const label = t(`crm.sales.profile.fields.${key}`)
              const current = effectiveValue(profile, draft, key)
              return (
                <article key={key} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-a-text">{label}</h4>
                    <Button type="button" size="sm" variant="secondary" aria-label={t('crm.wizard.use_field', { field: label })}
                      onClick={() => onApply({ [key]: suggestion.value }, capture.id)}>
                      <Check size={14} aria-hidden />{t('crm.wizard.use_suggestion')}
                    </Button>
                  </div>
                  <div className={`grid gap-2 ${current ? 'lg:grid-cols-2' : ''}`}>
                    {current && <div className="min-w-0 space-y-1 rounded-lg bg-a-surface-2 p-2.5">
                      <p className="text-xs font-semibold text-a-text-2">{t('crm.wizard.current_value')}</p><Value value={current} />
                    </div>}
                    <div className="min-w-0 space-y-1 rounded-lg bg-a-surface-2 p-2.5">
                      <p className="text-xs font-semibold crm-ai-text">{t('crm.wizard.ai_suggestion')}</p>
                      <Value value={suggestion.value} />
                      <EvidenceList sources={suggestion.sources} />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}
      <details open={pending.length === 0} className="rounded-xl border border-a-border bg-a-surface-2">
        <summary className="cursor-pointer p-3 text-sm font-semibold text-a-text focus-visible:outline-2 focus-visible:outline-a-accent">
          {t('crm.wizard.profile_summary')}
        </summary>
        <div className="space-y-3 bg-a-surface p-3">
          {FIELD_STEPS.map(step => (
            <section key={step} className="overflow-hidden rounded-xl border border-a-border">
              <div className="flex items-center justify-between gap-2 bg-a-surface-2 px-3 py-2.5">
                <h3 className="text-sm font-semibold text-a-text">{t(`crm.wizard.steps.${step}`)}</h3>
                {canEdit && (
                  <button type="button" onClick={() => onEdit(step)} className="text-xs font-semibold text-a-accent-text hover:underline"
                    aria-label={t('crm.wizard.edit_section', { section: t(`crm.wizard.steps.${step}`) })}>{t('crm.common.edit')}</button>
                )}
              </div>
              <div className="divide-y divide-a-border">
                {profile.steps[step].map(key => {
                  const value = effectiveValue(profile, draft, key)
                  const suggestion = suggestions[key]
                  const adopted = Boolean(suggestion && capture?.id === captureId && suggestion.value === draft[key]?.trim())
                  const saved = draft[key]?.trim() === profile.manual[key] ? profile.sources[key] : undefined
                  const evidence = adopted ? suggestion?.sources : saved
                  return (
                    <article key={key} className="min-w-0 space-y-1 px-3 py-2.5">
                      <h4 className="text-sm font-medium text-a-text">{t(`crm.sales.profile.fields.${key}`)}</h4>
                      {value ? <Value value={value} /> : <p className="text-xs text-a-text-2">{t('crm.wizard.blank')}</p>}
                      {!draft[key]?.trim() && profile.inherited[key] && <Pill tone="neutral">{t('crm.sales.profile.planner')}</Pill>}
                      {!!evidence?.length && <EvidenceList sources={evidence} />}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </details>
    </div>
  )
}

function Value({ value }: { value: string }) {
  const { t } = useTranslation()
  const body = 'whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-relaxed text-a-text-2'
  if (value.length < 280) return <p className={body}>{value}</p>
  return (
    <details className="space-y-1">
      <summary className="cursor-pointer rounded-sm text-xs font-medium text-a-accent-text focus-visible:outline-2 focus-visible:outline-a-accent">
        {t('crm.wizard.full_value')}
      </summary>
      <p className={body}>{value}</p>
    </details>
  )
}

export function EvidenceList({ sources }: { sources: Evidence[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-a-text-2">
      {sources.map((source, index) => (
        <li key={`${source.type}:${source.url ?? source.title}:${index}`} className="min-w-0 [overflow-wrap:anywhere]">
          {source.url
            ? <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-a-accent-text hover:underline">
              <ArrowUpRight size={12} aria-hidden className="mt-0.5 shrink-0" />{source.title}
            </a>
            : <span className="inline-flex items-start gap-1"><FileText size={12} aria-hidden className="mt-0.5 shrink-0" />{source.title}</span>}
        </li>
      ))}
    </ul>
  )
}
