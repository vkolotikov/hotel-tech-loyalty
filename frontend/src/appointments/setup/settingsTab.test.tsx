import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SetupPayload, SetupSettings } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/api', () => ({ appointmentsApi: {}, failureOf: () => ({ status: 0, code: '', message: '' }), onWorkspaceOff: () => () => {} }))

const { SettingsTab, changedSettings, settingsDraftOf } = await import('./SettingsTab')

const settings: SetupSettings = {
  timezone: 'Europe/Riga', timezone_named: true, zones: ['Europe/London', 'Europe/Riga'], currency: 'EUR',
  lead_minutes: 60, slot_step: 15, max_advance_days: 60, allow_master_choice: true, points_on_bookings: true, programme_on: true,
  booking_link: 'https://app.example.test/services/tok', embed_snippet: '<div id="hoteltech-services"></div>', upcoming_appointments: 12,
  client_messages_staff_default: false, client_messages_reminder_hours: 0, client_messages_language: 'en',
  deposits_on: false, deposit_percent: 20, deposits_available: true, deposits_reason: null, cancel_hours: 24,
}
const data = { can_manage: true, settings } as SetupPayload

describe('changedSettings', () => {
  it('sends only what changed, so an untouched currency never relabels anything', () => {
    const draft = settingsDraftOf(settings)
    expect(changedSettings(draft, settings)).toEqual({})
    expect(changedSettings({ ...draft, slot_step: 30, lead_minutes: '120' }, settings)).toEqual({ slot_step: 30, lead_minutes: 120 })
    expect(changedSettings({ ...draft, currency: 'GBP' }, settings)).toEqual({ currency: 'GBP' })
  })
})

describe('SettingsTab', () => {
  it('shows the venue, the online booking rules, loyalty and the booking link', () => {
    const html = renderToStaticMarkup(<SettingsTab data={data} refresh={() => {}} />)
    expect(html).toMatch(/<option value="Europe\/Riga" selected="">/)
    expect(html).toContain('12 upcoming appointments keep their clock times')
    expect(html).toMatch(/<option value="45">/)
    expect(html).toContain('Award points when an appointment is completed')
    expect(html).toContain('https://app.example.test/services/tok')
    expect(html).toContain('&lt;div id=&quot;hoteltech-services&quot;&gt;&lt;/div&gt;')
    expect(html).toContain('>Save<')
  })

  it('leaves loyalty out without a programme and says when there is no link', () => {
    const html = renderToStaticMarkup(<SettingsTab data={{ ...data, settings: { ...settings, programme_on: false, booking_link: null, embed_snippet: null } }} refresh={() => {}} />)
    expect(html).not.toContain('Award points')
    expect(html).toContain('This organisation has no booking link yet.')
  })

  it('is read-only for someone who is not a manager', () => {
    const html = renderToStaticMarkup(<SettingsTab data={{ ...data, can_manage: false }} refresh={() => {}} />)
    expect(html).toContain('<fieldset disabled=""')
    expect(html).not.toContain('>Save<')
  })
})

describe('client messages in Setup', () => {
  it('offers the three settings to a manager, as stored', () => {
    const stored = { ...settings, client_messages_staff_default: true, client_messages_reminder_hours: 24, client_messages_language: 'ru' }
    const html = renderToStaticMarkup(<SettingsTab data={{ ...data, settings: stored }} refresh={() => {}} />)
    expect(html).toContain('Client messages')
    expect(html).toContain('Email clients about changes staff make')
    expect(html).toMatch(/<option value="24" selected="">24 hours before<\/option>/)
    expect(html).toMatch(/<option value="ru" selected="">Русский<\/option>/)
    expect(html).toContain('<option value="0">Off</option>')
  })

  it('sends only what changed', () => {
    const draft = { ...settingsDraftOf(settings), client_messages_reminder_hours: 2 }
    expect(changedSettings(draft, settings)).toEqual({ client_messages_reminder_hours: 2 })
    expect(changedSettings({ ...settingsDraftOf(settings), client_messages_staff_default: true, client_messages_language: 'de' }, settings))
      .toEqual({ client_messages_staff_default: true, client_messages_language: 'de' })
  })
})

describe('deposits', () => {
  it('switching on sends the proposed percent with it, and only what changed after that', () => {
    const draft = settingsDraftOf(settings)
    expect(changedSettings({ ...draft, deposits_on: true }, settings)).toEqual({ deposits_on: true, deposit_percent: 20 })
    const on = { ...settings, deposits_on: true, deposit_percent: 25 }
    expect(changedSettings(settingsDraftOf(on), on)).toEqual({})
    expect(changedSettings({ ...settingsDraftOf(on), deposit_percent: '30' }, on)).toEqual({ deposit_percent: 30 })
    expect(changedSettings({ ...settingsDraftOf(on), deposits_on: false }, on)).toEqual({ deposits_on: false })
  })

  it('shows the switch and the venue\'s window', () => {
    const html = renderToStaticMarkup(<SettingsTab data={data} refresh={() => {}} />)
    expect(html).toContain('Deposits for online bookings')
    expect(html).toContain('at least 24 hours before')
  })

  it('keeps the switch off and says why when Stripe cannot take deposits', () => {
    const off = { ...settings, deposits_available: false, deposits_reason: 'currency_mismatch' as const }
    const html = renderToStaticMarkup(<SettingsTab data={{ ...data, settings: off }} refresh={() => {}} />)
    expect(html).toContain('another currency')
    expect(html).toMatch(/disabled=""\/>Ask for a deposit/)
  })
})
