import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { appointmentsApi, failureOf, type ApiFailure } from '../lib/api'
import { previewThenSave } from '../lib/preview'
import type { HoursRow, SetupPayload, SetupService, SetupTeamMember, TeamBody } from '../lib/types'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { useConflictConfirm } from './ConflictDialog'
import { FailureNotice } from './FailureNotice'
import { linkOf } from './links'
import { MemberTimeOff } from './MemberTimeOff'
import { WeekEditor } from './WeekEditor'

export interface TeamDraft {
  name: string; title: string; email: string; phone: string; user_id: number | null; is_active: boolean
  services: Record<number, { on: boolean; duration: string; price: string }>
}

// eslint-disable-next-line react-refresh/only-export-components
export function teamDraftOf(member: SetupTeamMember | null, services: SetupService[]): TeamDraft {
  const links: TeamDraft['services'] = {}
  for (const service of services) {
    const link = member?.services.find(s => s.id === service.id)
    links[service.id] = {
      on: link !== undefined,
      duration: link?.duration_minutes != null ? String(link.duration_minutes) : '',
      price: link?.price != null ? String(link.price) : '',
    }
  }
  return {
    name: member?.name ?? '', title: member?.title ?? '', email: member?.email ?? '', phone: member?.phone ?? '',
    user_id: member?.user_id ?? null, is_active: member?.is_active ?? true, services: links,
  }
}

const textOrNull = (raw: string): string | null => (raw.trim() === '' ? null : raw.trim())
const numberOrNull = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw))

// eslint-disable-next-line react-refresh/only-export-components
export function teamBodyOf(draft: TeamDraft): TeamBody {
  return {
    name: draft.name.trim(), title: textOrNull(draft.title), email: textOrNull(draft.email), phone: textOrNull(draft.phone),
    user_id: draft.user_id, is_active: draft.is_active,
    services: Object.entries(draft.services)
      .filter(([, s]) => s.on)
      .map(([id, s]) => ({ id: Number(id), duration_minutes: numberOrNull(s.duration), price: numberOrNull(s.price) })),
  }
}

const input = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text disabled:bg-a-surface-2'

/** A team member in the right-hand panel: profile and services, then (once saved) their week and their time off. */
export function TeamEditor({ member: initial, data, onClose, onChanged }: { member: SetupTeamMember | null; data: SetupPayload; onClose: () => void; onChanged: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const heading = useRef<HTMLHeadingElement>(null)
  const [member, setMember] = useState<SetupTeamMember | null>(initial)
  const [draft, setDraft] = useState(() => teamDraftOf(initial, data.services))
  const [saving, setSaving] = useState<'profile' | 'hours' | null>(null)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const { dialog, confirm } = useConflictConfirm(locale)
  const readOnly = !data.can_manage
  const set = (patch: Partial<TeamDraft>) => setDraft(d => ({ ...d, ...patch }))
  const setService = (id: number, patch: Partial<TeamDraft['services'][number]>) =>
    setDraft(d => ({ ...d, services: { ...d.services, [id]: { ...linkOf(d.services, id), ...patch } } }))

  useEffect(() => { heading.current?.focus() }, [])

  const saved = (next: SetupTeamMember | undefined) => {
    if (!next) return
    setMember(next)
    onChanged()
  }

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setSaving('profile')
    setFailure(null)
    try {
      const body = teamBodyOf(draft)
      if (member === null) saved((await appointmentsApi.createTeamMember(body)).team_member)
      else saved((await previewThenSave(dryRun => appointmentsApi.updateTeamMember(member.id, body, dryRun), confirm))?.team_member)
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setSaving(null)
    }
  }

  const saveHours = async (rows: HoursRow[]) => {
    if (member === null) return
    setSaving('hours')
    setFailure(null)
    try {
      saved((await previewThenSave(dryRun => appointmentsApi.saveHours(member.id, rows, dryRun), confirm))?.team_member)
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setSaving(null)
    }
  }

  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="team-editor-title"
      className="fixed right-0 top-14 bottom-0 z-30 w-full sm:w-[480px] overflow-y-auto bg-a-surface border-l border-a-border shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-a-border px-5 py-4">
        <h2 id="team-editor-title" ref={heading} tabIndex={-1} className="text-base font-semibold text-a-text">
          {member ? member.name : t('appointments.setup.team.new', 'New team member')}
        </h2>
        <button type="button" onClick={onClose} aria-label={t('appointments.common.close', 'Close')} className="rounded-lg p-1.5 text-a-text-2 hover:text-a-text">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="space-y-6 px-5 py-4">
        <form onSubmit={saveProfile} className="space-y-4" aria-labelledby="team-profile">
          <h3 id="team-profile" className="text-sm font-semibold text-a-text">{t('appointments.setup.team.profile', 'Profile')}</h3>
          <fieldset disabled={readOnly} className="space-y-3">
            <Field label={t('appointments.setup.team.name', 'Name')}>
              <input required value={draft.name} onChange={(e) => set({ name: e.target.value })} className={input} />
            </Field>
            <Field label={t('appointments.setup.team.title', 'Title')}>
              <input value={draft.title} onChange={(e) => set({ title: e.target.value })} className={input} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('appointments.setup.team.email', 'Email')}>
                <input type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} className={input} />
              </Field>
              <Field label={t('appointments.setup.team.phone', 'Phone')}>
                <input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} className={input} />
              </Field>
            </div>
            {data.can_manage && (
              <Field label={t('appointments.setup.team.sign_in', 'Signs in as')} hint={t('appointments.setup.team.sign_in_hint', 'Linking a sign-in lets this person add their own time off.')}>
                <select value={draft.user_id ?? ''} onChange={(e) => set({ user_id: e.target.value ? Number(e.target.value) : null })} className={input}>
                  <option value="">{t('appointments.setup.team.no_sign_in', 'Not linked')}</option>
                  {data.staff_accounts.map(a => <option key={a.user_id} value={a.user_id}>{a.name} · {a.email}</option>)}
                </select>
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={draft.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
              {t('appointments.setup.active', 'Active')}
            </label>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-a-text-2">{t('appointments.setup.team.services', 'Services they perform')}</legend>
              {data.services.map(service => {
                const s = linkOf(draft.services, service.id)
                return (
                  <div key={service.id} className="rounded-lg border border-a-border px-3 py-2">
                    <label className="flex items-center gap-2 text-sm text-a-text">
                      <input type="checkbox" checked={s.on} onChange={(e) => setService(service.id, { on: e.target.checked })} />
                      {service.name}
                    </label>
                    {s.on && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Field label={t('appointments.setup.services.own_duration', 'Own minutes')}>
                          <input type="number" min={5} max={1440} value={s.duration} onChange={(e) => setService(service.id, { duration: e.target.value })} className={input} />
                        </Field>
                        <Field label={t('appointments.setup.services.own_price', 'Own price')}>
                          <input type="number" min={0} step="0.01" value={s.price} onChange={(e) => setService(service.id, { price: e.target.value })} className={input} />
                        </Field>
                      </div>
                    )}
                  </div>
                )
              })}
            </fieldset>
          </fieldset>
          {!readOnly && <Button type="submit" loading={saving === 'profile'}>{t('appointments.setup.team.save_profile', 'Save profile')}</Button>}
        </form>

        {member && (
          <section aria-labelledby="team-hours" className="space-y-3">
            <h3 id="team-hours" className="text-sm font-semibold text-a-text">{t('appointments.setup.team.hours', 'Weekly hours')}</h3>
            <WeekEditor key={`${member.id}:${JSON.stringify(member.week)}`} rows={member.week} readOnly={readOnly} locale={locale}
              saving={saving === 'hours'} onSave={(rows) => { void saveHours(rows) }} />
          </section>
        )}

        {member && (
          <section aria-labelledby="team-time-off" className="space-y-3">
            <h3 id="team-time-off" className="text-sm font-semibold text-a-text">{t('appointments.setup.team.time_off', 'Time off')}</h3>
            <MemberTimeOff member={member} canEdit={data.can_manage || data.my_team_member_id === member.id} onChanged={(next) => saved(next)} />
          </section>
        )}

        <FailureNotice failure={failure} />
      </div>
      {dialog}
    </aside>
  )
}
