import { useId, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, Sparkles, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { failureOf, get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { leadPath } from '../lib/links'
import { CONTROL, Select, TextArea, TextInput } from '../ui/inputs'
import { SidePanel } from '../ui/SidePanel'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { useTeam } from '../tasks/taskData'
import { CustomFieldInputs } from './CustomFields'
import { useLeadChanged, useLeadFields, useLeadSettings, usePipelines } from './leadData'
import {
  activeFields, customErrors, defaultPipeline, EMPTY_LEAD, firstOpenStage, guestBody, leadBody, missingCustom, ownerOptions,
  sortedStages, sourceOptions, validateLead, type LeadDraft, type LeadField,
} from './leadLogic'
import type { GuestHit, LeadDetail, Paginated } from './leadTypes'
import { problemText, sourceLabel } from './leadWords'

const SERVER_FIELDS: Record<string, LeadField> = {
  full_name: 'name', email: 'email', guest_id: 'guest', total_value: 'value', check_out: 'checkOut', num_rooms: 'rooms', num_adults: 'adults', num_children: 'children',
}

/**
 * Add a lead (the full admin's Add inquiry): a new contact (`POST guests`) or one already known, then the lead
 * (`POST inquiries`) in the default pipeline's first stage unless another is chosen. Stay details only for a hotel;
 * the enquiry type where the organisation has types; its own fields when it has some. Opens on `/crm/leads?new=1`
 * (Today and Find link there), or filled in by the AI from a pasted message (`initial`).
 */
export function LeadForm({ presetGuest, initial, onClose }: { presetGuest?: number | null; initial?: LeadDraft | null; onClose: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const navigate = useNavigate()
  const toast = useToast()
  const changed = useLeadChanged()
  const formId = useId()
  const pipelines = usePipelines()
  const settings = useLeadSettings()
  const team = useTeam()
  const fieldsQuery = useLeadFields()
  const fields = activeFields(fieldsQuery.data)
  const stay = boot.organization.industry === 'hotel'
  const stages = sortedStages(defaultPipeline(pipelines.data)?.stages).filter(s => s.kind === 'open')

  const [draft, setDraft] = useState<LeadDraft>(() => initial ?? ({
    ...EMPTY_LEAD,
    contact: presetGuest ? 'existing' : 'new',
    guestId: presetGuest ?? null,
    owner: boot.staff.name,
  }))
  const [guestName, setGuestName] = useState<string | null>(null)
  /** A contact made by an earlier try whose lead failed: used again, never made twice. */
  const [madeGuest, setMadeGuest] = useState<number | null>(null)
  const [tried, setTried] = useState(false)
  const set = (patch: Partial<LeadDraft>) => setDraft(d => ({ ...d, ...patch }))

  const preset = useQuery({
    queryKey: ['crm', 'leads', 'guest', presetGuest],
    queryFn: () => get<GuestHit>(`guests/${presetGuest}`),
    enabled: Boolean(presetGuest),
    staleTime: 60_000,
  })

  const status = draft.status || firstOpenStage(stages)?.name || ''
  const errors = validateLead(draft)
  const missing = missingCustom(fields, draft.custom)

  const create = useMutation({
    mutationFn: async () => {
      let guestId = draft.contact === 'existing' ? draft.guestId : madeGuest
      if (!guestId) {
        const guest = await send<{ id: number }>('post', 'guests', guestBody(draft))
        guestId = guest.id
        setMadeGuest(guest.id)
      }
      return send<LeadDetail>('post', 'inquiries', leadBody({ ...draft, status }, guestId, { stay, fields }))
    },
    onSuccess: lead => {
      changed()
      toast(t('crm.leads.added', 'Lead added'))
      onClose()
      navigate(leadPath(lead.id))
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (Object.keys(errors).length > 0 || missing.length > 0) return
    create.mutate()
  }

  const failure = failureOf(create.error)
  const serverBad = new Set(Object.keys(failure.fields ?? {}).map(k => SERVER_FIELDS[k]).filter(Boolean))
  const problem = (field: LeadField) => (tried ? problemText(t, errors[field]) : undefined) ?? (serverBad.has(field) ? t('crm.leads.problem_check', 'Check this.') : undefined)
  const owners = ownerOptions(boot.staff.name, settings.owners, team.data ?? [], null)
  const pickedName = guestName ?? preset.data?.full_name ?? null

  return (
    <SidePanel title={t('crm.leads.new_title', 'Add a lead')} onClose={onClose}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={create.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" form={formId} loading={create.isPending}>{t('crm.leads.add', 'Add the lead')}</Button>
        </div>
      )}>
      <form id={formId} onSubmit={submit} noValidate className="space-y-5">
        {initial && <Notice tone="info"><span className="inline-flex items-start gap-2"><Sparkles size={15} aria-hidden className="crm-ai-text mt-0.5 shrink-0" />{t('crm.leads.capture_filled', 'Filled in by the AI from the message. Check it before you add the lead.')}</span></Notice>}
        {create.isError && <Notice tone="danger">{errorText(t, create.error)}</Notice>}
        {madeGuest && create.isError && <Notice tone="info">{t('crm.leads.contact_kept', 'The contact was saved; trying again adds only the lead.')}</Notice>}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-a-text">{t('crm.leads.contact', 'Contact')}</h3>
          {!madeGuest && (
            <Tabs label={t('crm.leads.contact', 'Contact')} value={draft.contact} onChange={contact => set({ contact })}
              items={[{ key: 'new', label: t('crm.leads.contact_new', 'New contact') }, { key: 'existing', label: t('crm.leads.contact_existing', 'Someone you know') }]} />
          )}
          {draft.contact === 'new' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('crm.leads.field_name', 'Name')}>
                <TextInput value={draft.name} onChange={e => set({ name: e.target.value })} maxLength={200} autoFocus disabled={Boolean(madeGuest)}
                  autoComplete="off" aria-invalid={problem('name') ? true : undefined} />
                {problem('name') && <span className="mt-1 block text-xs text-a-danger">{problem('name')}</span>}
              </Field>
              <Field label={t('crm.leads.field_company', 'Company (optional)')}>
                <TextInput value={draft.company} onChange={e => set({ company: e.target.value })} maxLength={200} disabled={Boolean(madeGuest)} autoComplete="off" />
              </Field>
              <Field label={t('crm.leads.field_email', 'Email (optional)')}>
                <TextInput type="email" value={draft.email} onChange={e => set({ email: e.target.value })} maxLength={150} disabled={Boolean(madeGuest)}
                  autoComplete="off" aria-invalid={problem('email') ? true : undefined} />
                {problem('email') && <span className="mt-1 block text-xs text-a-danger">{problem('email')}</span>}
              </Field>
              <Field label={t('crm.leads.field_phone', 'Phone (optional)')}>
                <TextInput type="tel" value={draft.phone} onChange={e => set({ phone: e.target.value })} maxLength={50} disabled={Boolean(madeGuest)} autoComplete="off" />
              </Field>
              <Field label={t('crm.leads.field_country_opt', 'Country (optional)')}>
                <TextInput value={draft.country} onChange={e => set({ country: e.target.value })} maxLength={100} disabled={Boolean(madeGuest)} autoComplete="off" />
              </Field>
            </div>
          ) : (
            <GuestPicker picked={draft.guestId} name={pickedName}
              onPick={g => { set({ guestId: g.id }); setGuestName(g.full_name || g.email || null) }}
              onClear={() => { set({ guestId: null }); setGuestName(null) }} />
          )}
          {draft.contact === 'existing' && problem('guest') && <p className="text-xs text-a-danger">{t('crm.leads.problem_guest', 'Choose who the lead is for.')}</p>}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-a-text">{t('crm.leads.the_lead', 'The lead')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('crm.leads.field_stage', 'Stage')}>
              <Select value={status} onChange={e => set({ status: e.target.value })}>
                {stages.length === 0 && <option value="">{t('crm.leads.stage_default', 'First stage')}</option>}
                {stages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label={t('crm.leads.field_source', 'Where it came from')}>
              <Select value={draft.source} onChange={e => set({ source: e.target.value })}>
                <option value="">{sourceLabel(t, '')}</option>
                {sourceOptions(settings.sources).map(s => <option key={s} value={s}>{sourceLabel(t, s)}</option>)}
              </Select>
            </Field>
            <Field label={t('crm.leads.field_value', 'Value ({{currency}}, optional)', { currency: boot.venue.currency })}>
              <TextInput type="number" inputMode="decimal" min={0} step="0.01" value={draft.value} onChange={e => set({ value: e.target.value })}
                aria-invalid={problem('value') ? true : undefined} />
              {problem('value') && <span className="mt-1 block text-xs text-a-danger">{problem('value')}</span>}
            </Field>
            <Field label={t('crm.leads.field_priority', 'Priority')}>
              <Select value={draft.priority} onChange={e => set({ priority: e.target.value })}>
                <option value="">{t('crm.leads.priority_none', 'Not set')}</option>
                {settings.priorities.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label={t('crm.leads.field_owner', 'Owner')}>
              <Select value={draft.owner} onChange={e => set({ owner: e.target.value })}>
                <option value="">{t('crm.leads.owner_none', 'Nobody yet')}</option>
                {owners.map(o => <option key={o} value={o}>{o === boot.staff.name ? t('crm.leads.owner_me', 'Me ({{name}})', { name: o }) : o}</option>)}
              </Select>
            </Field>
            {(settings.types.length > 0 || draft.type) && (
              <Field label={t('crm.leads.field_type', 'Type of enquiry')}>
                <Select value={draft.type} onChange={e => set({ type: e.target.value })}>
                  <option value="">{t('crm.leads.type_none', 'Not set')}</option>
                  {[...new Set([...settings.types, ...(draft.type ? [draft.type] : [])])].map(v => <option key={v} value={v}>{v}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <Field label={t('crm.leads.field_notes', 'Notes (optional)')}>
            <TextArea rows={3} value={draft.notes} onChange={e => set({ notes: e.target.value })} placeholder={t('crm.leads.notes_placeholder', 'What they asked for, dates, budget…')} />
          </Field>
        </section>

        {stay && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-a-text">{t('crm.leads.stay', 'Stay (optional)')}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('crm.leads.check_in', 'Arrival')}>
                <TextInput type="date" value={draft.checkIn} onChange={e => set({ checkIn: e.target.value })} />
              </Field>
              <Field label={t('crm.leads.check_out', 'Departure')}>
                <TextInput type="date" value={draft.checkOut} min={draft.checkIn || undefined} onChange={e => set({ checkOut: e.target.value })}
                  aria-invalid={problem('checkOut') ? true : undefined} />
                {problem('checkOut') && <span className="mt-1 block text-xs text-a-danger">{problem('checkOut')}</span>}
              </Field>
              <Field label={t('crm.leads.rooms', 'Rooms')}>
                <TextInput type="number" inputMode="numeric" min={1} step={1} value={draft.rooms} onChange={e => set({ rooms: e.target.value })}
                  aria-invalid={problem('rooms') ? true : undefined} />
                {problem('rooms') && <span className="mt-1 block text-xs text-a-danger">{problem('rooms')}</span>}
              </Field>
              <Field label={t('crm.leads.adults', 'Adults')}>
                <TextInput type="number" inputMode="numeric" min={1} step={1} value={draft.adults} onChange={e => set({ adults: e.target.value })}
                  aria-invalid={problem('adults') ? true : undefined} />
                {problem('adults') && <span className="mt-1 block text-xs text-a-danger">{problem('adults')}</span>}
              </Field>
              <Field label={t('crm.leads.children', 'Children')}>
                <TextInput type="number" inputMode="numeric" min={0} step={1} value={draft.children} onChange={e => set({ children: e.target.value })}
                  aria-invalid={problem('children') ? true : undefined} />
                {problem('children') && <span className="mt-1 block text-xs text-a-danger">{problem('children')}</span>}
              </Field>
            </div>
            <Field label={t('crm.leads.requests', 'Special requests (optional)')}>
              <TextArea rows={2} value={draft.requests} onChange={e => set({ requests: e.target.value })} />
            </Field>
          </section>
        )}

        {fields.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-a-text">{t('crm.leads.more_fields', 'More about the lead')}</h3>
            <CustomFieldInputs fields={fields} values={draft.custom} onChange={custom => set({ custom })}
              invalid={[...(tried ? missing : []), ...customErrors(failure.fields)]} />
            {tried && missing.length > 0 && <p className="text-xs text-a-danger">{t('crm.leads.problem_custom', 'Fill in the fields marked as needed.')}</p>}
          </section>
        )}
      </form>
    </SidePanel>
  )
}

/** Find a contact by name, email, phone or company (`GET guests?search=`). */
function GuestPicker({ picked, name, onPick, onClear }: { picked: number | null; name: string | null; onPick: (g: GuestHit) => void; onClear: () => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const term = q.trim()
  const found = useQuery({
    queryKey: ['crm', 'leads', 'guest-search', term],
    queryFn: () => get<Paginated<GuestHit>>(`guests${params({ search: term, per_page: 8 })}`),
    enabled: term.length >= 2,
    staleTime: 30_000,
  })

  if (picked) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-a-border bg-a-surface-2 px-3 py-2 text-sm text-a-text">
        <span className="min-w-0 flex-1 truncate">{name ?? t('crm.leads.contact_number', 'Contact #{{id}}', { id: picked })}</span>
        <button type="button" onClick={onClear} aria-label={t('crm.leads.contact_change', 'Choose someone else')} className="rounded-sm p-1 text-a-text-2 hover:text-a-text"><X size={15} aria-hidden /></button>
      </div>
    )
  }
  const rows = found.data?.data ?? []
  return (
    <div>
      <label className="relative block">
        <span className="sr-only">{t('crm.leads.contact_search', 'Find a contact')}</span>
        <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-a-text-2" />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} autoFocus className={`${CONTROL} pl-9`}
          placeholder={t('crm.leads.contact_search_hint', 'Name, email, phone or company')} />
      </label>
      {term.length >= 2 && (
        <ul className="mt-1.5 divide-y divide-a-border overflow-hidden rounded-xl border border-a-border">
          {found.isLoading && <li className="px-3 py-2 text-sm text-a-text-2">{t('crm.common.loading', 'Loading…')}</li>}
          {!found.isLoading && rows.length === 0 && <li className="px-3 py-2 text-sm text-a-text-2">{t('crm.leads.contact_none', 'Nobody matches. Add them as a new contact.')}</li>}
          {rows.map(g => (
            <li key={g.id}>
              <button type="button" onClick={() => onPick(g)} className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-a-surface-2">
                <span className="text-sm text-a-text">{g.full_name || g.email || t('crm.common.no_name', 'No name')}</span>
                <span className="text-xs text-a-text-2">{[g.company, g.email, g.phone].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
