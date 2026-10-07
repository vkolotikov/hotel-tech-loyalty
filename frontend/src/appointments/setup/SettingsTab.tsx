import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { appointmentsApi, failureOf, type ApiFailure } from '../lib/api'
import type { SettingsBody, SetupPayload, SetupSettings } from '../lib/types'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import { FailureNotice } from './FailureNotice'

// eslint-disable-next-line react-refresh/only-export-components
export const SLOT_STEPS = [5, 10, 15, 20, 30, 45, 60]
const CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'UAH', 'TRY', 'AED', 'ILS', 'CAD', 'AUD', 'NZD', 'JPY', 'SGD', 'HKD', 'ZAR', 'INR']

const REMINDER_HOURS = [0, 2, 24, 48]
// Each language in its own name: whoever reads the list reads their own.
const MESSAGE_LANGUAGES: [string, string][] = [['en', 'English'], ['ru', 'Русский'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español']]
// Part H: why Stripe cannot take deposits yet (the server's `deposits_reason`).
const DEPOSIT_REASON: Record<string, string> = {
  payments_off: 'Switch on online payments with your Stripe keys in the full admin (Settings → Booking) to take deposits.',
  mock_mode: 'Bookings are in test mode in the full admin (Settings → Booking): deposits need real payments.',
  currency_mismatch: 'Stripe takes payments in another currency than your prices. Make them the same to take deposits.',
}

export interface SettingsDraft {
  timezone: string; currency: string; lead_minutes: string; slot_step: number; max_advance_days: string
  allow_master_choice: boolean; points_on_bookings: boolean
  client_messages_staff_default: boolean; client_messages_reminder_hours: number; client_messages_language: string
  deposits_on: boolean; deposit_percent: string
}

// eslint-disable-next-line react-refresh/only-export-components
export function settingsDraftOf(s: SetupSettings): SettingsDraft {
  return {
    timezone: s.timezone, currency: s.currency, lead_minutes: String(s.lead_minutes), slot_step: s.slot_step,
    max_advance_days: String(s.max_advance_days), allow_master_choice: s.allow_master_choice, points_on_bookings: s.points_on_bookings,
    client_messages_staff_default: s.client_messages_staff_default, client_messages_reminder_hours: s.client_messages_reminder_hours,
    client_messages_language: s.client_messages_language,
    deposits_on: s.deposits_on, deposit_percent: String(s.deposit_percent),
  }
}

/** Only what changed: an untouched currency is never sent, so saving never relabels prices by accident. */
// eslint-disable-next-line react-refresh/only-export-components
export function changedSettings(draft: SettingsDraft, s: SetupSettings): SettingsBody {
  const body: SettingsBody = {}
  if (draft.timezone !== s.timezone) body.timezone = draft.timezone
  if (draft.currency !== s.currency) body.currency = draft.currency
  if (Number(draft.lead_minutes) !== s.lead_minutes) body.lead_minutes = Number(draft.lead_minutes)
  if (draft.slot_step !== s.slot_step) body.slot_step = draft.slot_step
  if (Number(draft.max_advance_days) !== s.max_advance_days) body.max_advance_days = Number(draft.max_advance_days)
  if (draft.allow_master_choice !== s.allow_master_choice) body.allow_master_choice = draft.allow_master_choice
  if (draft.points_on_bookings !== s.points_on_bookings) body.points_on_bookings = draft.points_on_bookings
  if (draft.client_messages_staff_default !== s.client_messages_staff_default) body.client_messages_staff_default = draft.client_messages_staff_default
  if (draft.client_messages_reminder_hours !== s.client_messages_reminder_hours) body.client_messages_reminder_hours = draft.client_messages_reminder_hours
  if (draft.client_messages_language !== s.client_messages_language) body.client_messages_language = draft.client_messages_language
  if (draft.deposits_on !== s.deposits_on) body.deposits_on = draft.deposits_on
  // Switching on sends the percent too: what Setup proposes (20%) is not stored yet.
  if (draft.deposits_on && (!s.deposits_on || Number(draft.deposit_percent) !== s.deposit_percent)) body.deposit_percent = Number(draft.deposit_percent)
  return body
}

const input = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text disabled:bg-a-surface-2'
const withCurrent = <T,>(list: T[], current: T): T[] => (list.includes(current) ? list : [current, ...list])

export function SettingsTab({ data, refresh }: { data: SetupPayload; refresh: () => void }) {
  const { t } = useTranslation()
  const s = data.settings
  const [draft, setDraft] = useState(() => settingsDraftOf(s))
  const [pending, setPending] = useState<{ services: number; extras: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const [copied, setCopied] = useState<'link' | 'snippet' | null>(null)
  const readOnly = !data.can_manage
  const body = changedSettings(draft, s)
  const set = (patch: Partial<SettingsDraft>) => { setSaved(false); setDraft(d => ({ ...d, ...patch })) }

  const write = async () => {
    setSaving(true)
    setFailure(null)
    try {
      await appointmentsApi.saveSettings(body)
      setPending(null)
      setSaved(true)
      refresh()
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setSaving(false)
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (body.currency) {
      try {
        const impact = await appointmentsApi.currencyPreview(body.currency)
        if (impact.services + impact.extras > 0) { setPending(impact); return }
      } catch (error) {
        setFailure(failureOf(error))
        return
      }
    }
    await write()
  }

  const copy = async (kind: 'link' | 'snippet', text: string) => {
    try { await navigator.clipboard.writeText(text) } catch { /* the field stays selectable */ }
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 2000)
    try { await appointmentsApi.linkCopied(); refresh() } catch { /* the checklist mark is a convenience */ }
  }

  return (
    <div className="space-y-6 pt-4">
      <form onSubmit={save} className="space-y-6">
        <fieldset disabled={readOnly} className="space-y-6">
          <section aria-labelledby="settings-venue" className="space-y-3">
            <h2 id="settings-venue" className="text-sm font-semibold text-a-text">{t('appointments.setup.settings.venue', 'Venue')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('appointments.setup.settings.timezone', 'Time zone')}
                hint={t('appointments.setup.settings.timezone_note', 'Changing the time zone does not move appointments: {{count}} upcoming appointments keep their clock times.', { count: s.upcoming_appointments })}>
                <select value={draft.timezone} onChange={(e) => set({ timezone: e.target.value })} className={input}>
                  {withCurrent(s.zones, s.timezone).map(zone => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              </Field>
              <Field label={t('appointments.setup.settings.currency', 'Currency')} hint={t('appointments.setup.settings.currency_note', 'Changing the currency relabels prices; it never converts them.')}>
                <select value={draft.currency} onChange={(e) => set({ currency: e.target.value })} className={input}>
                  {withCurrent(CURRENCIES, s.currency).map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              </Field>
            </div>
          </section>

          <section aria-labelledby="settings-online" className="space-y-3">
            <h2 id="settings-online" className="text-sm font-semibold text-a-text">{t('appointments.setup.settings.online', 'Online booking')}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('appointments.setup.settings.lead', 'Minimum notice (minutes)')}>
                <input type="number" min={0} max={10080} value={draft.lead_minutes} onChange={(e) => set({ lead_minutes: e.target.value })} className={input} />
              </Field>
              <Field label={t('appointments.setup.settings.step', 'Start times every')}>
                <select value={draft.slot_step} onChange={(e) => set({ slot_step: Number(e.target.value) })} className={input}>
                  {withCurrent(SLOT_STEPS, s.slot_step).map(step => <option key={step} value={step}>{t('appointments.setup.settings.step_minutes', '{{count}} min', { count: step })}</option>)}
                </select>
              </Field>
              <Field label={t('appointments.setup.settings.ahead', 'Bookable up to (days ahead)')}>
                <input type="number" min={1} max={365} value={draft.max_advance_days} onChange={(e) => set({ max_advance_days: e.target.value })} className={input} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={draft.allow_master_choice} onChange={(e) => set({ allow_master_choice: e.target.checked })} />
              {t('appointments.setup.settings.choose_person', 'Clients may choose the person')}
            </label>
          </section>

          <section aria-labelledby="settings-deposits" className="space-y-3">
            <h2 id="settings-deposits" className="text-sm font-semibold text-a-text">{t('appointments.setup.deposits.title', 'Deposits for online bookings')}</h2>
            <p className="text-sm text-a-text-2">{t('appointments.setup.deposits.intro', 'Clients booking on your booking page pay part of the price by card. Cancelled at least {{hours}} hours before, it goes back automatically; cancelled later, or a no-show, and the venue keeps it. The rest is paid at the venue.', { hours: s.cancel_hours })}</p>
            {!s.deposits_available && s.deposits_reason && (
              <Notice tone="info">{t(`appointments.setup.deposits.reason.${s.deposits_reason}`, DEPOSIT_REASON[s.deposits_reason])}</Notice>
            )}
            <label className="flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={draft.deposits_on} disabled={!s.deposits_available && !s.deposits_on} onChange={(e) => set({ deposits_on: e.target.checked })} />
              {t('appointments.setup.deposits.on', 'Ask for a deposit')}
            </label>
            {draft.deposits_on && (
              <Field label={t('appointments.setup.deposits.percent', 'Deposit (% of the price)')}>
                <input type="number" min={1} max={100} value={draft.deposit_percent} onChange={(e) => set({ deposit_percent: e.target.value })} className={input} />
              </Field>
            )}
          </section>

          {s.programme_on && (
            <section aria-labelledby="settings-loyalty" className="space-y-3">
              <h2 id="settings-loyalty" className="text-sm font-semibold text-a-text">{t('appointments.setup.settings.loyalty', 'Loyalty')}</h2>
              <label className="flex items-center gap-2 text-sm text-a-text">
                <input type="checkbox" checked={draft.points_on_bookings} onChange={(e) => set({ points_on_bookings: e.target.checked })} />
                {t('appointments.setup.settings.points', 'Award points when an appointment is completed')}
              </label>
            </section>
          )}

          <section aria-labelledby="settings-messages" className="space-y-3">
            <h2 id="settings-messages" className="text-sm font-semibold text-a-text">{t('appointments.messages.setup.title', 'Client messages')}</h2>
            <label className="flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={draft.client_messages_staff_default} onChange={(e) => set({ client_messages_staff_default: e.target.checked })} />
              {t('appointments.messages.setup.staff', 'Email clients about changes staff make (staff can untick it each time)')}
            </label>
            <Field label={t('appointments.messages.setup.reminder', 'Reminder before each visit')}>
              <select className={input} value={draft.client_messages_reminder_hours} onChange={(e) => set({ client_messages_reminder_hours: Number(e.target.value) })}>
                {REMINDER_HOURS.map(h => (
                  <option key={h} value={h}>{h === 0 ? t('appointments.messages.setup.off', 'Off') : t('appointments.messages.setup.hours', '{{count}} hours before', { count: h })}</option>
                ))}
              </select>
            </Field>
            <Field label={t('appointments.messages.setup.language', "Language when the client's is not known")}>
              <select className={input} value={draft.client_messages_language} onChange={(e) => set({ client_messages_language: e.target.value })}>
                {MESSAGE_LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </Field>
          </section>
        </fieldset>

        {pending && (
          <div className="space-y-2">
            <Notice tone="warning">
              {t('appointments.setup.settings.currency_confirm', '{{services}} services and {{extras}} extras will show {{currency}}. The amounts stay the same. Change the currency?', { services: pending.services, extras: pending.extras, currency: draft.currency })}
            </Notice>
            <div className="flex gap-2">
              <Button type="button" variant="danger" loading={saving} onClick={() => { void write() }}>{t('appointments.setup.conflict.save_anyway', 'Save anyway')}</Button>
              <Button type="button" variant="secondary" onClick={() => setPending(null)}>{t('appointments.setup.conflict.back', 'Back')}</Button>
            </div>
          </div>
        )}
        <FailureNotice failure={failure} />
        {saved && <Notice tone="success">{t('appointments.setup.settings.saved', 'Saved.')}</Notice>}
        {!readOnly && !pending && (
          <Button type="submit" loading={saving} disabled={Object.keys(body).length === 0}>{t('appointments.setup.save', 'Save')}</Button>
        )}
      </form>

      <section aria-labelledby="settings-link" className="space-y-3">
        <h2 id="settings-link" className="text-sm font-semibold text-a-text">{t('appointments.setup.settings.link', 'Booking page')}</h2>
        {s.booking_link && s.embed_snippet ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <a href={s.booking_link} target="_blank" rel="noreferrer" className="min-w-0 break-all text-sm text-a-accent-deep underline">{s.booking_link}</a>
              <Button type="button" size="sm" variant="secondary" onClick={() => { void copy('link', s.booking_link ?? '') }}>
                <Copy size={14} aria-hidden /> {copied === 'link' ? t('appointments.setup.settings.copied', 'Copied') : t('appointments.setup.settings.copy', 'Copy')}
              </Button>
            </div>
            <Field label={t('appointments.setup.settings.snippet', 'Website embed code')}>
              <textarea readOnly rows={3} value={s.embed_snippet} className={`${input} font-mono text-xs`} />
            </Field>
            <Button type="button" size="sm" variant="secondary" onClick={() => { void copy('snippet', s.embed_snippet ?? '') }}>
              <Copy size={14} aria-hidden /> {copied === 'snippet' ? t('appointments.setup.settings.copied', 'Copied') : t('appointments.setup.settings.copy', 'Copy')}
            </Button>
          </>
        ) : (
          <p className="text-sm text-a-text-2">{t('appointments.setup.settings.no_link', 'This organisation has no booking link yet.')}</p>
        )}
      </section>
    </div>
  )
}
