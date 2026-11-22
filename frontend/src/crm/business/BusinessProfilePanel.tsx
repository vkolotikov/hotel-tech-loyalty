import { useId, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDownToLine, Building2, CircleHelp, ClipboardCheck, ExternalLink, Globe2, Save, Sparkles, Target } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'

export type CustomerResource = 'guests' | 'inquiries'
type FieldType = 'short' | 'url' | 'text' | 'list'
type FieldValue = string | string[]
type Fields = Record<string, FieldValue>
type Sources = Record<string, { url: string; title: string }[]>
type Discovery = {
  id?: string
  status: 'queued' | 'running' | 'ready' | 'needs_identity' | 'failed'
  fields?: Fields
  sources?: Sources
  opportunities?: string[]
  questions?: string[]
  error?: string
}
type Profile = {
  groups: Record<string, Record<string, FieldType>>
  fields: Fields
  sources: Sources
  suggested_company: string | null
  revision: number
  discovery: Discovery | null
}

function busy(discovery: Discovery | null | undefined) {
  return discovery?.status === 'queued' || discovery?.status === 'running'
}

function fieldText(value: FieldValue | undefined) {
  return Array.isArray(value) ? value.join('\n') : value ?? ''
}

function formFields(profile: Profile) {
  return Object.fromEntries(Object.values(profile.groups).flatMap(group => Object.keys(group)).map(key =>
    [key, fieldText(profile.fields[key] ?? (key === 'company_name' ? profile.suggested_company ?? '' : ''))],
  ))
}

const GROUP_ICON = { identity: Building2, positioning: Target, offer: Globe2, planning: CircleHelp }
const FIELD_CLASS = 'w-full rounded-xl border border-a-border bg-a-surface-2 px-3 py-2 text-sm text-a-text focus-visible:outline-2 focus-visible:outline-a-accent'
const saveMethod = 'put'
const researchMethod = 'post'

export function BusinessProfilePanel({ resource, id }: { resource: CustomerResource; id: number }) {
  const path = resource + '/' + id + '/business-profile'
  const key = ['crm', 'business-profile', resource, id] as const
  const profile = useQuery({
    queryKey: key,
    queryFn: () => get<Profile>(path),
    refetchInterval: query => busy(query.state.data?.discovery) ? 4000 : false,
  })
  return (
    <QueryState loading={profile.isLoading} error={profile.data ? null : profile.error} rows={2} onRetry={() => void profile.refetch()}>
      {profile.data && <ProfileForm key={path} path={path} queryKey={key} profile={profile.data} />}
    </QueryState>
  )
}

function ProfileForm({ path, queryKey, profile }: { path: string; queryKey: readonly unknown[]; profile: Profile }) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const cache = useQueryClient()
  const toast = useToast()
  const [draft, setDraft] = useState(() => formFields(profile))
  const [baseline, setBaseline] = useState(draft)
  const [revision, setRevision] = useState(profile.revision)
  const discovery = profile.discovery
  const progress = busy(discovery)
  const dirty = Object.keys(draft).some(key => draft[key] !== baseline[key])
  const update = (key: string, value: string) => setDraft(previous => ({ ...previous, [key]: value }))

  function load(next: Profile) {
    const fields = formFields(next)
    setRevision(next.revision)
    setDraft(fields)
    setBaseline(fields)
  }

  const save = useMutation({
    mutationFn: () => send<Profile>(saveMethod, path, {
      revision,
      discovery_id: discovery?.id,
      fields: Object.fromEntries(Object.values(profile.groups).flatMap(group => Object.entries(group)).map(([key, type]) =>
        [key, type === 'list' ? draft[key].split(/\r?\n/).map(line => line.trim()).filter(Boolean) : draft[key].trim() || null],
      )),
    }),
    onSuccess: next => {
      cache.setQueryData(queryKey, next)
      load(next)
      toast(t('crm.business.saved'))
    },
  })

  const research = useMutation({
    mutationFn: () => send<Profile>(researchMethod, path, {
      company_name: draft.company_name.trim() || null,
      website_url: draft.website_url.trim() || null,
      language: (i18n.resolvedLanguage ?? 'en').split('-')[0],
    }),
    onSuccess: next => cache.setQueryData(queryKey, next),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (dirty) save.mutate()
  }

  const suggestions = Object.entries(discovery?.fields ?? {})
  const fillEmpty = () => setDraft(previous => ({
    ...previous,
    ...Object.fromEntries(suggestions.filter(([key]) => !previous[key].trim()).map(([key, value]) => [key, fieldText(value)])),
  }))
  const failed = save.error ?? research.error
  const code = failureOf(failed).code
  const error = code === 'invalid' ? t('crm.business.invalid_fields')
    : ['profile_changed', 'company_required', 'discovery_unavailable'].includes(code) ? t(`crm.business.${code}`)
    : errorText(t, failed)

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card title={t('crm.business.title')} icon={Globe2} tone="ai" description={t('crm.business.description')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['company_name', 'website_url'] as const).map(key => (
            <label key={key} className="space-y-1 text-sm font-medium text-a-text">
              <span>{t(`crm.business.fields.${key}`)}</span>
              <input type={key === 'website_url' ? 'url' : 'text'} className={FIELD_CLASS}
                placeholder={key === 'website_url' ? 'https://' : undefined}
                maxLength={key === 'website_url' ? 2048 : 200} value={draft[key]} onChange={e => update(key, e.target.value)} />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {progress && <p role="status" className="mr-auto text-sm text-a-text-2">{t('crm.business.researching')}</p>}
          <Button type="button" size="sm" className="crm-ai-soft min-h-9" loading={research.isPending || progress}
            disabled={save.isPending} onClick={() => { save.reset(); research.mutate() }}>
            <Sparkles size={15} aria-hidden />{t('crm.business.research')}
          </Button>
        </div>
        {discovery?.status === 'failed' && <div role="status" className="mt-3"><Notice tone="warning">{
          discovery.error === 'ai_budget_used_up' ? t('crm.errors.ai_budget_used_up')
            : discovery.error === 'discovery_timed_out' ? t('crm.business.discovery_timed_out')
            : t('crm.errors.ai_failed')
        }</Notice></div>}
        {discovery?.status === 'needs_identity' && (
          <div role="status" className="mt-3 space-y-2">
            <Notice tone="warning">{t('crm.business.needs_identity')}</Notice>
            {!!discovery.questions?.length && <ul className="list-disc space-y-1 pl-5 text-sm text-a-text-2">{discovery.questions.map(note => <li key={note}>{note}</li>)}</ul>}
          </div>
        )}
      </Card>

      {discovery?.status === 'ready' && (
        <Card title={t('crm.business.findings')} icon={Sparkles} tone="ai"
          description={t('crm.business.review_hint')}
          action={suggestions.some(([key]) => !draft[key].trim()) && (
            <Button type="button" size="sm" variant="secondary" onClick={fillEmpty}>{t('crm.business.fill_empty')}</Button>
          )}>
          <div className="grid gap-3 sm:grid-cols-2">
            {suggestions.map(([key, value]) => (
              <div key={key} className="min-w-0 rounded-xl border border-a-border bg-a-surface-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-a-text">{t(`crm.business.fields.${key}`)}</h3>
                  {draft[key] !== fieldText(value) && (
                    <Button type="button" size="sm" variant="secondary"
                      onClick={() => update(key, fieldText(value))}>{t('crm.business.use_field')}</Button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-a-text">{fieldText(value)}</p>
                <SourceLinks links={discovery.sources?.[key]} />
              </div>
            ))}
          </div>
          <ResearchNotes title={t('crm.business.fields.service_opportunities')} notes={discovery.opportunities}
            onUse={notes => update('service_opportunities', notes)} />
          <ResearchNotes title={t('crm.business.fields.proposal_questions')} notes={discovery.questions}
            onUse={notes => update('proposal_questions', notes)} />
        </Card>
      )}

      {failed && <div role="alert"><Notice tone="danger">{error}</Notice></div>}
      {revision !== profile.revision && (
        <Button type="button" size="sm" variant="secondary" onClick={() => { load(profile); save.reset() }}>{t('crm.business.reload')}</Button>
      )}
      {code === 'profile_changed' && revision === profile.revision && (
        <Button type="button" size="sm" variant="secondary" onClick={async () => {
          try {
            const next = await get<Profile>(path)
            cache.setQueryData(queryKey, next)
            load(next)
            save.reset()
          } catch (error) { toast(errorText(t, error), 'danger') }
        }}>{t('crm.business.reload')}</Button>
      )}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-a-border bg-a-surface p-2.5 shadow-a-sm">
        {Object.keys(profile.fields).some(key => !(key in profile.groups.planning)) && (
          <Button type="button" size="sm" variant="secondary" onClick={() => downloadProfile(profile)}>
            <ArrowDownToLine size={15} aria-hidden />{t('crm.business.export')}
          </Button>
        )}
        <Button type="submit" size="sm" loading={save.isPending} disabled={!dirty || research.isPending || revision !== profile.revision}
          onClick={() => research.reset()}><Save size={15} aria-hidden />{t('crm.business.save')}</Button>
      </div>

      {Object.entries(profile.groups).map(([group, definitions]) => (
        <Card key={group} title={t(`crm.business.groups.${group}`)} icon={GROUP_ICON[group as keyof typeof GROUP_ICON]}>
          <div className="grid gap-4 sm:auto-rows-min sm:grid-cols-2">
            {Object.entries(definitions).filter(([key]) => key !== 'company_name' && key !== 'website_url').map(([key, type]) => (
              <div key={key} className="min-w-0 space-y-1">
                <label htmlFor={id + key} className="block text-sm font-medium text-a-text">{t(`crm.business.fields.${key}`)}</label>
                {type === 'short' ? (
                  <input id={id + key} className={FIELD_CLASS} maxLength={200} value={draft[key]} onChange={e => update(key, e.target.value)} />
                ) : (
                  <textarea id={id + key} className={FIELD_CLASS + ' min-h-20 resize-y'} rows={3} maxLength={type === 'list' ? 2411 : 2000}
                    placeholder={type === 'list' ? t('crm.business.one_per_line') : undefined} value={draft[key]} onChange={e => update(key, e.target.value)} />
                )}
                {draft[key] === fieldText(profile.fields[key]) && <SourceLinks links={profile.sources[key]} />}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </form>
  )
}

function SourceLinks({ links }: { links: Sources[string] | undefined }) {
  if (!links?.length) return null
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
      {links.map(({ url, title }) => (
        <li key={url} className="min-w-0">
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1 break-all text-xs text-a-accent-text underline">
            <ExternalLink size={12} className="mt-0.5 shrink-0" aria-hidden />{title}
          </a>
        </li>
      ))}
    </ul>
  )
}

function ResearchNotes({ title, notes, onUse }: { title: string; notes?: string[]; onUse: (notes: string) => void }) {
  const { t } = useTranslation()
  if (!notes?.length) return null
  return (
    <div className="mt-3 border-t border-a-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-a-text">{title}</h3>
        <Button type="button" size="sm" variant="secondary" onClick={() => onUse(notes.join('\n'))}>
          <ClipboardCheck size={14} aria-hidden />{t('crm.business.use_notes')}
        </Button>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-a-text-2">{notes.map(note => <li key={note}>{note}</li>)}</ul>
    </div>
  )
}

function downloadProfile(profile: Profile) {
  const fields = Object.fromEntries(Object.entries(profile.fields).filter(([key]) => !(key in profile.groups.planning)))
  const sources = Object.fromEntries(Object.entries(profile.sources).filter(([key]) => key in fields))
  const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 'customer_business_profile.v1', fields, sources }, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'business-profile.json'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
