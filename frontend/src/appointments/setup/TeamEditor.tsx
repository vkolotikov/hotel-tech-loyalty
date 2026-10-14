import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { appointmentsApi, failureOf, type ApiFailure } from '../lib/api'
import { previewThenSave } from '../lib/preview'
import type { HoursRow, SetupPayload, SetupService, SetupTeamMember, TeamBody } from '../lib/types'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { useConflictConfirm } from './ConflictDialog'
import { FailureNotice } from './FailureNotice'
import { linkOf } from './links'
import { MemberTimeOff } from './MemberTimeOff'
import { WeekEditor } from './WeekEditor'

export interface TeamDraft {
  name: string; title: string; email: string; phone: string; user_id: number | null; is_active: boolean
  /** A palette hex, or null = Automatic. */
  color: string | null
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
    user_id: member?.user_id ?? null, is_active: member?.is_active ?? true, color: member?.color ?? null, services: links,
  }
}

/**
 * The palette key of the colour Automatic gives this member, for the hint; only
 * while they are on Automatic and stay there. A saved choice is reserved for its
 * owner, so while one is being switched back to Automatic the server's colour for
 * them is still that choice, not what Automatic will give them once saved.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function automaticColourKey(member: SetupTeamMember | null, draftColor: string | null, palette: NonNullable<SetupPayload['palette']>, teamColors: NonNullable<SetupPayload['team_colors']>): string | undefined {
  if (!member || member.color != null || draftColor !== null) return undefined
  const assigned = teamColors[String(member.id)]
  return assigned ? palette.find(c => c.hex.toLowerCase() === assigned.toLowerCase())?.key : undefined
}

const textOrNull = (raw: string): string | null => (raw.trim() === '' ? null : raw.trim())
const numberOrNull = (raw: string): number | null => (raw.trim() === '' ? null : Number(raw))

const sameColour = (a: string | null, b: string | null): boolean => (a === null || b === null ? a === b : a.toLowerCase() === b.toLowerCase())

/**
 * The save body for `draft`, measured against `member` as last saved (null: a
 * new person). The colour goes only when the manager changed it: sent every
 * time, it would overwrite another manager's change made meanwhile, and a
 * stored colour the palette no longer has would be refused on every save.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function teamBodyOf(draft: TeamDraft, member: SetupTeamMember | null): TeamBody {
  return {
    name: draft.name.trim(), title: textOrNull(draft.title), email: textOrNull(draft.email), phone: textOrNull(draft.phone),
    user_id: draft.user_id, is_active: draft.is_active,
    ...(sameColour(draft.color, member?.color ?? null) ? {} : { color: draft.color }),
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
  // The colour a member on Automatic is shown in (the server's assignment), named in the hint so a manager can see what Automatic means for them.
  // A server from before the colours (the deploy window) sends neither key: Automatic alone, nothing to name.
  const palette = data.palette ?? []
  const assignedKey = automaticColourKey(member, draft.color, palette, data.team_colors ?? {})
  const colourHint = t('appointments.setup.team.colour_hint', 'Shown as a dot on their appointments and a ring on their column.')
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
      const body = teamBodyOf(draft, member)
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
      className="fixed right-0 top-14 !mt-0 bottom-0 z-30 w-full sm:w-[480px] overflow-y-auto bg-a-surface border-l border-a-border shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-a-border px-5 py-4">
        <h2 id="team-editor-title" ref={heading} tabIndex={-1} className="font-a-display text-xl font-normal text-a-text">
          {member ? member.name : t('appointments.setup.team.new', 'New team member')}
        </h2>
        <button type="button" onClick={onClose} aria-label={t('appointments.common.close', 'Close')} className="rounded-lg p-1.5 text-a-text-2 hover:text-a-text">
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="space-y-6 px-5 py-4">
        <form onSubmit={saveProfile} className="space-y-4" aria-labelledby="team-profile">
          <h3 id="team-profile" className="font-a-display text-lg font-normal text-a-text">{t('appointments.setup.team.profile', 'Profile')}</h3>
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
            {/* The legend names the group of native radios (once); the hint describes it. */}
            <fieldset aria-describedby="team-colour-hint" className="space-y-2">
              <legend className="text-xs font-medium text-a-text-2">{t('appointments.setup.team.colour', 'Colour on the calendar')}</legend>
              <div className="flex flex-wrap items-center gap-2">
                {/* Checked is a ring; keyboard focus is an outline beyond it, so a checked choice with the focus looks different from one without. */}
                <label className="inline-flex items-center gap-2 rounded-full border border-a-border px-3 py-1.5 text-sm text-a-text has-[:checked]:border-a-accent-text has-[:checked]:ring-1 has-[:checked]:ring-a-accent-text has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-a-accent-text">
                  <input type="radio" name="team-colour" className="sr-only" checked={draft.color === null} onChange={() => set({ color: null })} />
                  {t('appointments.setup.team.colour_auto', 'Automatic')}
                </label>
                {palette.map(c => {
                  // The colour's word on hover too: blue, indigo and violet are close for some eyes.
                  const name = t(`appointments.colours.${c.key}`, c.key)
                  return (
                    <label key={c.key} title={name} className="relative inline-flex h-8 w-8 items-center justify-center rounded-full has-[:checked]:ring-2 has-[:checked]:ring-offset-2 has-[:checked]:ring-offset-a-surface has-[:checked]:ring-a-accent-text has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[6px] has-[:focus-visible]:outline-a-accent-text">
                      <input type="radio" name="team-colour" className="sr-only" checked={draft.color === c.hex} onChange={() => set({ color: c.hex })} />
                      <span aria-hidden className="a-member-dot h-6 w-6 rounded-full" style={{ '--a-m': c.hex } as CSSProperties} />
                      <span className="sr-only">{name}</span>
                    </label>
                  )
                })}
              </div>
              <p id="team-colour-hint" className="text-xs text-a-text-2">
                {assignedKey ? `${colourHint} (${t(`appointments.colours.${assignedKey}`, assignedKey)})` : colourHint}
              </p>
            </fieldset>
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
            <h3 id="team-hours" className="font-a-display text-lg font-normal text-a-text">{t('appointments.setup.team.hours', 'Weekly hours')}</h3>
            <WeekEditor key={`${member.id}:${JSON.stringify(member.week)}`} rows={member.week} readOnly={readOnly} locale={locale}
              saving={saving === 'hours'} onSave={(rows) => { void saveHours(rows) }} />
          </section>
        )}

        {member && (
          <section aria-labelledby="team-time-off" className="space-y-3">
            <h3 id="team-time-off" className="font-a-display text-lg font-normal text-a-text">{t('appointments.setup.team.time_off', 'Time off')}</h3>
            <MemberTimeOff member={member} canEdit={data.can_manage || data.my_team_member_id === member.id} onChanged={(next) => saved(next)} />
          </section>
        )}

        <FailureNotice failure={failure} />
      </div>
      {dialog}
    </aside>
  )
}
