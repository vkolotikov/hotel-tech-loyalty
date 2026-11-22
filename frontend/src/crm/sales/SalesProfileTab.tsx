import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Building2, Save, Target } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, get, params, send } from '../lib/api'
import { brandParam } from '../lib/brand'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { SALES_FIELD } from './assistantData'

const PROFILE_PATH = 'crm/sales-profile'
const GROUPS = { business: Building2, selling: Target }
type Profile = {
  brand: { id: number; name: string }
  groups: Record<keyof typeof GROUPS, string[]>
  fields: Record<string, string>
  manual: Record<string, string>
  inherited: Record<string, string>
  revision: number
}

export function SalesProfileTab({ canEdit }: { canEdit: boolean }) {
  const [search] = useSearchParams()
  const brand = brandParam()
  const requested = Number(search.get('for_brand'))
  const target = brand === 'all' && Number.isSafeInteger(requested) && requested > 0 ? requested : null
  const path = PROFILE_PATH + params({ for_brand: target })
  const key = ['crm', 'sales-profile', brand, target] as const
  const query = useQuery({ queryKey: key, queryFn: () => get<Profile>(path) })
  return (
    <QueryState loading={query.isLoading} error={query.data ? null : query.error} rows={3} onRetry={() => void query.refetch()}>
      {query.data && <ProfileForm key={query.data.brand.id} path={path} profile={query.data} queryKey={key} canEdit={canEdit} />}
    </QueryState>
  )
}

const put = 'put'

function ProfileForm({ path, profile, queryKey, canEdit }: { path: string; profile: Profile; queryKey: readonly unknown[]; canEdit: boolean }) {
  const { t } = useTranslation()
  const cache = useQueryClient()
  const toast = useToast()
  const id = useId()
  const [editing, setEditing] = useState<{ fields: Profile['manual']; revision: number } | null>(null)
  const draft = editing?.fields ?? profile.manual
  const dirty = Object.values(profile.groups).flat().some(key => (draft[key] ?? '').trim() !== (profile.manual[key] ?? ''))
  const update = (key: string, value: string) => setEditing({ fields: { ...draft, [key]: value }, revision: editing?.revision ?? profile.revision })

  const save = useMutation({
    mutationFn: () => send<Profile>(put, path, {
      profile_brand: profile.brand.id, revision: editing?.revision ?? profile.revision, fields: draft,
    }),
    onSuccess: next => {
      cache.setQueryData(queryKey, next)
      setEditing(null)
      toast(t('crm.sales.profile.saved'))
    },
  })
  const changed = failureOf(save.error).code === 'sales_profile_changed'
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (dirty && canEdit && !save.isPending) save.mutate()
  }

  return (
    <form onSubmit={submit} aria-label={t('crm.sales.profile.title')} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-a-border bg-a-surface px-4 py-3">
        <div>
          <h2 className="break-words text-base font-semibold text-a-text">{profile.brand.name}</h2>
          <p className="mt-1 text-sm text-a-text-2">{t(canEdit ? 'crm.sales.profile.caption' : 'crm.sales.profile.read_only')}</p>
        </div>
        {canEdit && <Button type="submit" size="sm" loading={save.isPending} disabled={!dirty || changed}><Save size={15} aria-hidden />{t('crm.common.save')}</Button>}
      </div>
      {save.error && (
        <div role="alert">
          <Notice tone="danger">{changed ? t('crm.sales.profile.changed') : errorText(t, save.error)}</Notice>
          {changed && (
            <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={async () => {
              await cache.invalidateQueries({ queryKey })
              setEditing(null)
              save.reset()
            }}>{t('crm.sales.reload')}</Button>
          )}
        </div>
      )}
      {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map(group => (
        <Card key={group} title={t(`crm.sales.profile.groups.${group}`)} icon={GROUPS[group]} tone={group === 'business' ? 'accent' : 'ai'}>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {profile.groups[group].map(key => {
              const inherited = profile.inherited[key]
              const fallback = inherited ?? (key === 'name' ? profile.brand.name : '')
              const value = canEdit ? draft[key] ?? '' : profile.fields[key] ?? ''
              const fieldId = `${id}-${key}`
              const captionId = `${fieldId}-source`
              const input = {
                id: fieldId, value, placeholder: canEdit ? fallback || (key === 'website' ? 'https://' : undefined) : undefined,
                onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, event.target.value),
                maxLength: key === 'website' ? 2000 : 3000, className: SALES_FIELD, readOnly: !canEdit || save.isPending,
                'aria-describedby': inherited ? captionId : undefined,
              }
              return (
                <div key={key} className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={fieldId} className="text-sm font-medium text-a-text">{t(`crm.sales.profile.fields.${key}`)}</label>
                    {inherited && <span id={captionId}><Pill tone={draft[key]?.trim() ? 'neutral' : 'success'}>{t(draft[key]?.trim() ? 'crm.sales.profile.crm_value' : 'crm.sales.profile.planner')}</Pill></span>}
                  </div>
                  {key === 'website' || key === 'name'
                    ? <input {...input} type={key === 'website' ? 'url' : 'text'} />
                    : <textarea {...input} rows={key === 'offerings' ? 4 : 3} />}
                  {canEdit && inherited && (
                    <details className="text-xs text-a-text-2">
                      <summary className="cursor-pointer">{t('crm.sales.profile.view_planner')}</summary>
                      <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{inherited}</p>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      ))}
    </form>
  )
}
