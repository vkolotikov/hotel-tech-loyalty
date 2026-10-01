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
