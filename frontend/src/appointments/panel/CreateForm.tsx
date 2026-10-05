import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { money } from '../../lib/money'
import type { CalendarMaster, CatalogueService, CouponOption, CouponRef, DateKey, PriceQuote, SlotsPayload } from '../lib/types'
import { timeOf } from '../lib/wallClock'
import { useVocab } from '../lib/vocab'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { ClientPicker } from './ClientPicker'
import { canSave, type CreateDraft, type PanelError, type Source } from './panelState'
import { TellClient } from './TellClient'

interface Props {
  draft: CreateDraft
  masters: CalendarMaster[]
  services: CatalogueService[]
  /** The server's free times for the chosen service, person and day; undefined until all three are chosen and loaded. */
  slots: SlotsPayload | undefined
  slotsLoading: boolean
  today: DateKey
  saving: boolean
  error: PanelError | null
  onEdit: (patch: Partial<CreateDraft>) => void
  onSave: () => void
  /** "Tell the client by email" (Part D). */
  tell: boolean
  onTell: (tell: boolean) => void
  /** Part E: the server's price for a member, the member's coupons, and a typed code. */
  quote?: PriceQuote
  coupons?: CouponOption[]
  onResolveCode?: (code: string) => Promise<void>
}

const control = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Slot → client → service → review → save. Every choice that decides the
 * price, the duration or whether the time is free comes from the server
 * (`slots`); the form computes none of it.
 */
export function CreateForm(p: Props) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const { draft } = p

  const service = p.services.find(s => s.id === draft.serviceId) ?? null
  const servicesOffered = p.services.filter(s => draft.masterId === null || s.master_ids.includes(draft.masterId))
  const mastersOffered = p.masters.filter(m => service === null || service.master_ids.includes(m.id))

  const slot = p.slots?.slots.find(s => timeOf(s.start) === draft.time) ?? null
  const timeLost = draft.time !== null && p.slots !== undefined && slot === null
  const ready = canSave(draft) && slot !== null

  const sources: [Source, string][] = [
    ['admin', t('appointments.panel.source_desk', 'At the desk')],
    ['phone', t('appointments.panel.source_phone', 'By phone')],
    ['walk_in', t('appointments.panel.source_walk_in', 'Walk-in')],
  ]

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready && !p.saving) p.onSave() }}>
      <ClientPicker client={draft.client} onPick={(client) => p.onEdit({ client })} />

      <Field label={t('appointments.panel.date', 'Date')}>
        <input type="date" className={control} min={p.today} value={draft.date} onChange={(e) => { if (e.target.value) p.onEdit({ date: e.target.value }) }} />
      </Field>

      <Field label={vocab('team_member')}>
        <select className={control} value={draft.masterId ?? ''} onChange={(e) => {
          const masterId = e.target.value ? Number(e.target.value) : null
          const keeps = service !== null && masterId !== null && service.master_ids.includes(masterId)
          p.onEdit({ masterId, ...(keeps ? {} : { serviceId: null }) })
        }}>
          <option value="">{t('appointments.panel.choose', 'Choose…')}</option>
          {mastersOffered.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>

      <Field label={vocab('service')}>
        <select className={control} value={draft.serviceId ?? ''} onChange={(e) => p.onEdit({ serviceId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">{t('appointments.panel.choose', 'Choose…')}</option>
          {servicesOffered.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>

      <Field label={t('appointments.panel.time', 'Time')}>
        <select className={control} value={slot ? draft.time ?? '' : ''} disabled={!p.slots} onChange={(e) => p.onEdit({ time: e.target.value || null })}>
          <option value="">{p.slotsLoading ? t('appointments.common.loading', 'Loading…') : t('appointments.panel.choose_time', 'Choose a time…')}</option>
          {p.slots?.slots.map(s => <option key={s.start} value={timeOf(s.start)}>{s.label}</option>)}
        </select>
      </Field>

      {timeLost && <Notice tone="warning">{t('appointments.panel.time_lost', 'That time is no longer free. Choose another.')}</Notice>}
      {p.slots && p.slots.slots.length === 0 && <Notice tone="info">{t('appointments.panel.no_slots', 'No free time on this day for this service and team member.')}</Notice>}

      {slot && p.slots && (
        <dl className="rounded-lg bg-a-surface-2 px-3 py-2 text-sm">
          <div className="flex justify-between"><dt className="text-a-text-2">{t('appointments.panel.when', 'When')}</dt><dd className="font-semibold text-a-text">{timeOf(slot.start)} – {timeOf(slot.end)}</dd></div>
          <div className="flex justify-between"><dt className="text-a-text-2">{t('appointments.panel.duration', 'Duration')}</dt><dd className="text-a-text">{t('appointments.panel.minutes', '{{minutes}} min', { minutes: p.slots.duration_minutes })}</dd></div>
          {p.quote ? (
            <>
              {p.quote.discount && <div className="flex justify-between"><dt className="text-a-text-2">{t('appointments.money.price.list', 'List price')}</dt><dd className="text-a-text">{money(p.quote.list_amount, p.quote.currency)}</dd></div>}
              {p.quote.discount && <div className="flex justify-between"><dt className="text-a-text-2">{p.quote.discount.label}</dt><dd className="text-a-text">−{money(p.quote.discount.amount, p.quote.currency)}</dd></div>}
              <div className="flex justify-between"><dt className="text-a-text-2">{t('appointments.money.price.total', 'Total')}</dt><dd className="font-semibold text-a-text">{money(p.quote.total_amount, p.quote.currency)}</dd></div>
            </>
          ) : (
            <div className="flex justify-between"><dt className="text-a-text-2">{t('appointments.panel.price', 'Price')}</dt><dd className="font-semibold text-a-text">{money(p.slots.price, p.slots.currency)}</dd></div>
          )}
        </dl>
      )}

      {draft.client?.member && p.onResolveCode && (
        <Field label={t('appointments.money.price.coupon', 'Coupon')}>
          <select className={control} value={draft.coupon ? JSON.stringify(draft.coupon) : ''} onChange={(e) => p.onEdit({ coupon: e.target.value ? JSON.parse(e.target.value) as CouponRef : null })}>
            <option value="">{t('appointments.money.price.none', 'No coupon')}</option>
            {(p.coupons ?? []).map(c => <option key={JSON.stringify(c.coupon)} value={JSON.stringify(c.coupon)}>{c.label}</option>)}
          </select>
          <CouponCode onResolve={p.onResolveCode} />
        </Field>
      )}

      <Field label={t('appointments.panel.source', 'Booked')}>
        <select className={control} value={draft.source} onChange={(e) => p.onEdit({ source: e.target.value as Source })}>
          {sources.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </Field>

      <Field label={t('appointments.panel.staff_note', 'Note for the team')}>
        <textarea className={control} rows={2} maxLength={2000} value={draft.staffNotes} onChange={(e) => p.onEdit({ staffNotes: e.target.value })} />
      </Field>

      {p.error && <Notice tone="danger">{t(`appointments.error.${p.error.code}`, p.error.message)}</Notice>}

      {draft.client && <TellClient email={draft.client.email ?? null} checked={p.tell} onChange={p.onTell} />}
      <Button type="submit" full disabled={!ready} loading={p.saving}>{t('appointments.panel.save', 'Save appointment')}</Button>
    </form>
  )
}

/** A code the client shows (an offer code or a reward's REW- code), resolved for this member by the server. */
function CouponCode({ onResolve }: { onResolve: (code: string) => Promise<void> }) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  return (
    <div className="mt-2 flex gap-2">
      <input className={control} placeholder={t('appointments.money.price.code', 'Code')} value={code} onChange={(e) => setCode(e.target.value)} />
      <Button type="button" variant="secondary" disabled={code.trim() === ''} onClick={() => { void onResolve(code.trim()).then(() => setCode('')) }}>{t('appointments.money.price.apply', 'Apply')}</Button>
    </div>
  )
}
