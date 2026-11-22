import { useId, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Building2, Check, ClipboardCheck, Compass, FileUp, Package, Save, Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, get, params, send } from '../lib/api'
import { brandParam } from '../lib/brand'
import { errorText } from '../lib/errors'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { SALES_FIELD } from './assistantData'
import { EvidenceList, SalesWizardReview } from './SalesWizardReview'
import { SalesWizardSources } from './SalesWizardSources'
import { effectiveValue, isCapturing, STEPS, validWebsite, websiteAddress, type CaptureData, type FieldStep, type Fields, type Profile, type Sources, type Step } from './salesWizard'

const PROFILE_PATH = 'crm/sales-profile'
const CAPTURE_PATH = 'crm/sales-profile/capture'
const ICONS = { sources: FileUp, company: Building2, market: Compass, services: Package, review: ClipboardCheck }
const post = 'post'
const put = 'put'

type Draft = { fields: Fields; revision: number; captureId?: string }

export function SalesProfileTab({ canEdit }: { canEdit: boolean }) {
  const [search] = useSearchParams()
  const brand = brandParam()
  const requested = Number(search.get('for_brand'))
  const target = brand === 'all' && Number.isSafeInteger(requested) && requested > 0 ? requested : null
  const scope = params({ for_brand: target })
  const queryKey = ['crm', 'sales-profile', brand, target] as const
  const query = useQuery({ queryKey, queryFn: () => get<Profile>(PROFILE_PATH + scope) })
  return (
    <QueryState loading={query.isLoading} error={query.data ? null : query.error} rows={3} onRetry={() => void query.refetch()}>
      {query.data && <ProfileWizard key={query.data.brand.id} scope={scope} profile={query.data} queryKey={queryKey} canEdit={canEdit} />}
    </QueryState>
  )
}

function ProfileWizard({ scope, profile, queryKey, canEdit }: {
  scope: string
  profile: Profile
  queryKey: readonly unknown[]
  canEdit: boolean
}) {
  const { t, i18n } = useTranslation()
  const cache = useQueryClient()
  const toast = useToast()
  const heading = useRef<HTMLHeadingElement>(null)
  const [step, setStep] = useState<Step>(canEdit ? 'sources' : 'review')
  const [editing, setEditing] = useState<Draft | null>(null)
  const [sources, setSources] = useState<Sources>({ website: '', name: profile.fields.name ?? profile.brand.name, search: false, files: [] })
  const [websiteError, setWebsiteError] = useState(false)
  const [invalidCaptureWebsite, setInvalidCaptureWebsite] = useState(false)
  const draft = editing?.fields ?? profile.manual
  const steps = STEPS.filter(item => canEdit || item !== 'sources')
  const fields = Object.values(profile.steps).flat()
  const filled = fields.filter(key => Boolean(effectiveValue(profile, draft, key))).length
  const dirty = fields.some(key => (draft[key] ?? '').trim() !== (profile.manual[key] ?? ''))
  const capturePath = CAPTURE_PATH + scope
  const captureKey = ['crm', 'sales-profile-capture', brandParam(), profile.brand.id] as const
  const captureQuery = useQuery({
    queryKey: captureKey, queryFn: () => get<CaptureData>(capturePath), enabled: canEdit,
    refetchInterval: query => isCapturing(query.state.data?.capture) ? 3000 : false,
  })
  const capture = captureQuery.data?.capture
  const busy = isCapturing(capture)
  const suggestionCount = capture?.status === 'ready'
    ? Object.entries(capture.fields ?? {}).filter(([key, finding]) => finding.value !== effectiveValue(profile, draft, key)).length : 0
  const go = (target: Step) => {
    setStep(target)
    if (target !== step) requestAnimationFrame(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'nearest' }) })
  }
  const update = (values: Fields, captureId = editing?.captureId) => {
    setEditing({ fields: { ...draft, ...values }, revision: editing?.revision ?? profile.revision, captureId })
    if ('website' in values) setWebsiteError(false)
  }

  const start = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.set('profile_brand', String(profile.brand.id))
      form.set('website', websiteAddress(sources.website))
      form.set('search_web', sources.search ? '1' : '0')
      if (sources.search) form.set('company_name', sources.name.trim())
      form.set('language', (i18n.resolvedLanguage ?? 'en').split('-')[0])
      sources.files.forEach(file => form.append('attachments[]', file))
      return send<CaptureData>(post, capturePath, form)
    },
    onMutate: () => cache.cancelQueries({ queryKey: captureKey }),
    onSuccess: next => {
      cache.setQueryData(captureKey, next)
      setSources(previous => ({ ...previous, files: [] }))
    },
  })
  const save = useMutation({
    mutationFn: (values: Fields) => send<Profile>(put, PROFILE_PATH + scope, {
      profile_brand: profile.brand.id, revision: editing?.revision ?? profile.revision, fields: values,
      capture_id: editing?.captureId,
    }),
    onSuccess: next => {
      cache.setQueryData(queryKey, next)
      setEditing(null)
      toast(t('crm.sales.profile.saved'))
    },
  })
  const conflict = failureOf(save.error).code === 'sales_profile_changed'
  const startFailure = failureOf(start.error)
  const captureError = invalidCaptureWebsite ? t('crm.wizard.errors.capture_bad_website')
    : start.error ? startFailure.fields && Object.keys(startFailure.fields).some(key => key.startsWith('attachments'))
      ? t('crm.wizard.errors.file_rejected')
      : startFailure.code.startsWith('capture_') ? captureMessage(t, startFailure.code) : errorText(t, start.error)
      : capture?.status === 'failed' ? captureMessage(t, capture.error ?? 'ai_failed') : undefined
  const beginCapture = () => {
    if (sources.website.trim() && !validWebsite(websiteAddress(sources.website))) {
      setInvalidCaptureWebsite(true)
      return
    }
    start.mutate()
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (step !== 'review' || !dirty || !canEdit || save.isPending || conflict) return
    const website = draft.website === undefined ? undefined : websiteAddress(draft.website)
    if (website && !validWebsite(website)) {
      go('company')
      setWebsiteError(true)
      return
    }
    save.mutate(website === undefined ? draft : { ...draft, website })
  }
  const active = steps.indexOf(step)
  const previous = steps[active - 1]
  const next = steps[active + 1]
  const StepIcon = ICONS[step]

  return (
    <form onSubmit={submit} aria-label={t('crm.sales.profile.title')} noValidate className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-a-border bg-a-surface px-4 py-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-a-text">{profile.brand.name}</h2>
          {!canEdit && <p className="mt-1 text-sm text-a-text-2">{t('crm.sales.profile.read_only')}</p>}
        </div>
        <p className="text-sm tabular-nums text-a-text-2">{t('crm.wizard.progress', { filled, total: fields.length })}</p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[13.5rem_minmax(0,1fr)]">
        <nav aria-label={t('crm.wizard.steps_label')} className="rounded-2xl border border-a-border bg-a-surface p-2 xl:sticky xl:top-2">
          <ol className="grid grid-cols-5 gap-1 xl:grid-cols-1">
            {steps.map((item, index) => {
              const keys = item === 'sources' || item === 'review' ? [] : profile.steps[item]
              const count = keys.filter(key => Boolean(effectiveValue(profile, draft, key))).length
              const current = item === step
              return (
                <li key={item} className="min-w-0">
                  <button type="button" aria-current={current ? 'step' : undefined} onClick={() => go(item)}
                    className={`flex h-full w-full min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center focus-visible:outline-2 focus-visible:outline-a-accent xl:flex-row xl:gap-2 xl:px-2.5 xl:text-left ${current ? 'bg-a-accent/15 text-a-text' : 'text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'}`}>
                    <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular-nums ${current ? 'bg-a-accent text-a-accent-ink' : 'bg-a-surface-2'}`}>
                      {keys.length > 0 && keys.length === count && !current ? <Check size={14} /> : index + 1}
                    </span>
                    <span className="min-w-0 text-xs font-medium [overflow-wrap:anywhere] xl:flex-1 xl:text-sm">{t(`crm.wizard.steps.${item}`)}</span>
                    {keys.length > 0 && <span className="hidden text-xs tabular-nums text-a-text-2 xl:block">{count}/{keys.length}</span>}
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <section aria-labelledby="sales-wizard-heading" className="min-w-0 rounded-2xl border border-a-border bg-a-surface shadow-a-sm">
          <div className="space-y-1 border-b border-a-border px-4 py-3 sm:px-5">
            <h2 id="sales-wizard-heading" ref={heading} tabIndex={-1} className="flex items-center gap-2 rounded-lg text-base font-semibold text-a-text focus-visible:outline-2 focus-visible:outline-a-accent">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg crm-ai-soft"><StepIcon size={17} aria-hidden /></span>
              {t(`crm.wizard.steps.${step}`)}
            </h2>
            <p className="text-sm leading-relaxed text-a-text-2">{t(`crm.wizard.intro.${step}`)}</p>
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            {canEdit && suggestionCount > 0 && step !== 'review' && (
              <div className="crm-ai-border flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-a-surface-2 p-3">
                <p role="status" className="flex items-center gap-2 text-sm text-a-text"><Sparkles size={15} className="crm-ai-text" aria-hidden />
                  {t('crm.wizard.suggestion_count', { count: suggestionCount })}
                </p>
                <Button type="button" size="sm" variant="secondary" onClick={() => go('review')}>{t('crm.wizard.review_suggestions')}</Button>
              </div>
            )}
            {!!capture?.warnings?.length && capture.status === 'ready' && (step === 'sources' || step === 'review') && (
              <Notice tone="warning">{capture.warnings.map(code => captureMessage(t, code)).join(' ')}</Notice>
            )}
            {step === 'sources' && (
              <>
                {captureQuery.isError && !captureQuery.data && (
                  <div className="space-y-2">
                    <Notice tone="warning">{errorText(t, captureQuery.error)}</Notice>
                    <Button type="button" size="sm" variant="secondary" onClick={() => void captureQuery.refetch()}>{t('crm.common.retry')}</Button>
                  </div>
                )}
                <SalesWizardSources value={sources} onChange={value => {
                  setSources(value)
                  setInvalidCaptureWebsite(false)
                  start.reset()
                }} limits={captureQuery.data?.limits} website={effectiveValue(profile, draft, 'website')}
                  disabled={!canEdit || busy || start.isPending} busy={busy || start.isPending}
                  capture={capture} error={captureError} onCapture={beginCapture} />
              </>
            )}
            {step !== 'sources' && step !== 'review' && (
              <ProfileFields keys={profile.steps[step]} profile={profile} draft={draft} canEdit={canEdit && !save.isPending}
                websiteError={websiteError} update={(key, value) => update({ [key]: value })} />
            )}
            {step === 'review' && <SalesWizardReview profile={profile} draft={draft} capture={capture} captureId={editing?.captureId}
              canEdit={canEdit && !save.isPending} onApply={update} onEdit={go} />}
            {save.error && (
              <div role="alert" className="space-y-2">
                <Notice tone="danger">{conflict ? t('crm.sales.profile.changed') : errorText(t, save.error)}</Notice>
                {conflict && <Button type="button" variant="secondary" size="sm" onClick={async () => {
                  await cache.invalidateQueries({ queryKey })
                  setEditing(null)
                  save.reset()
                }}>{t('crm.sales.reload')}</Button>}
              </div>
            )}
          </div>
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-b-2xl border-t border-a-border bg-a-surface px-4 py-3 sm:px-5">
            {previous
              ? <Button type="button" size="sm" variant="secondary" onClick={() => go(previous)}><ArrowLeft size={15} aria-hidden />{t('crm.wizard.back')}</Button>
              : <span />}
            {next
              ? <Button key="advance" type="button" size="sm" variant={step === 'sources' ? 'secondary' : 'primary'} onClick={event => {
                event.preventDefault()
                go(next)
              }}>
                {t(step === 'sources' ? 'crm.wizard.enter_manually' : next === 'review' ? 'crm.wizard.review_profile' : 'crm.wizard.continue')}<ArrowRight size={15} aria-hidden />
              </Button>
              : canEdit && <Button key="save" type="submit" size="sm" loading={save.isPending} disabled={!dirty || conflict}>
                <Save size={15} aria-hidden />{t('crm.wizard.save_profile')}
              </Button>}
          </div>
        </section>
      </div>
    </form>
  )
}

function ProfileFields({ keys, profile, draft, canEdit, websiteError, update }: {
  keys: Profile['steps'][FieldStep]
  profile: Profile
  draft: Fields
  canEdit: boolean
  websiteError: boolean
  update: (key: string, value: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="grid items-start gap-x-5 gap-y-4 sm:grid-cols-2">
      {keys.map(key => {
        const inherited = profile.inherited[key]
        const fallback = inherited ?? (key === 'name' ? profile.brand.name : '')
        const url = key === 'website'
        const long = key === 'offerings' || key === 'overview'
        const fieldId = `${id}-${key}`
        const value = draft[key] ?? fallback
        const proof = value && value === profile.manual[key] ? profile.sources[key] : undefined
        const attrs = {
          id: fieldId, className: SALES_FIELD, readOnly: !canEdit, value, maxLength: url ? 2000 : 3000,
          placeholder: fallback || (url ? 'example.com' : undefined),
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, event.target.value),
          'aria-invalid': url && websiteError ? true : undefined,
          'aria-describedby': url && websiteError ? `${fieldId}-error` : undefined,
        }
        return (
          <div key={key} className={`min-w-0 space-y-1.5 ${long ? 'sm:col-span-2' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <label htmlFor={fieldId} className="text-sm font-medium text-a-text">{t(`crm.sales.profile.fields.${key}`)}</label>
              {inherited && (draft[key]?.trim()
                ? canEdit && <button type="button" className="text-xs font-medium text-a-accent-text hover:underline" onClick={() => update(key, '')}>{t('crm.wizard.restore_planner')}</button>
                : <Pill tone="neutral">{t('crm.sales.profile.planner')}</Pill>)}
            </div>
            {url || key === 'name'
              ? <input {...attrs} type="text" inputMode={url ? 'url' : 'text'} />
              : <textarea {...attrs} rows={long ? 5 : 3} />}
            {url && websiteError && <p id={`${fieldId}-error`} role="alert" className="text-sm text-a-danger">{t('crm.wizard.errors.capture_bad_website')}</p>}
            {!!proof?.length && <EvidenceList sources={proof} />}
          </div>
        )
      })}
    </div>
  )
}

function captureMessage(t: TFunction, code: string) {
  if (code === 'ai_budget_used_up' || code === 'ai_failed') return t(`crm.errors.${code}`)
  if (code === 'assistant_unavailable') return t('crm.sales.errors.assistant_unavailable')
  return t(`crm.wizard.errors.${code}`, { defaultValue: t('crm.errors.unknown') })
}
