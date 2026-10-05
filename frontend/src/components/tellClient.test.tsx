import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, n) => String((vars ?? {})[n] ?? '')) }),
}))

const { staffDefaultFrom, notifyFor, statusTells } = await import('../lib/clientMessages')

describe('notifyFor', () => {
  it('sends the box as ticked when there is an address, and "do not tell" when the screen said nobody will be told', () => {
    expect(notifyFor('a@example.test', true)).toBe(true)
    expect(notifyFor('a@example.test', false)).toBe(false)
    expect(notifyFor('', true)).toBe(false)
    expect(notifyFor('   ', true)).toBe(false)
    expect(notifyFor(null, true)).toBe(false)
  })
})

describe('statusTells', () => {
  it('matches the server: confirmed from pending, cancelled from pending, confirmed or in progress', () => {
    expect(statusTells('pending', 'confirmed')).toBe(true)
    expect(statusTells('confirmed', 'confirmed')).toBe(false)
    for (const from of ['pending', 'confirmed', 'in_progress']) expect(statusTells(from, 'cancelled'), from).toBe(true)
    for (const from of ['completed', 'no_show', 'cancelled']) expect(statusTells(from, 'cancelled'), from).toBe(false)
    expect(statusTells('confirmed', 'completed')).toBe(false)
  })
})
const { TellClientCheckbox } = await import('./TellClient')
const { TellClientConfirm } = await import('./TellClientConfirm')

describe('staffDefaultFrom', () => {
  it('reads the venue setting from the grouped settings answer', () => {
    const answer = (value: unknown) => ({ settings: { general: [{ key: 'hotel_timezone', value: 'Europe/Riga' }], booking: [{ key: 'client_messages_staff_default', value }] } })
    expect(staffDefaultFrom(answer(true))).toBe(true)
    expect(staffDefaultFrom(answer('true'))).toBe(true)
    expect(staffDefaultFrom(answer(false))).toBe(false)
    expect(staffDefaultFrom({ settings: {} })).toBe(false)
    expect(staffDefaultFrom(undefined)).toBe(false)
  })
})

describe('TellClientCheckbox', () => {
  it('offers the box, or says there is no address', () => {
    expect(renderToStaticMarkup(<TellClientCheckbox email="a@example.test" checked onChange={() => {}} />)).toContain('Tell the client by email')
    expect(renderToStaticMarkup(<TellClientCheckbox email="" checked onChange={() => {}} />)).toContain('No email address — the client will not be told.')
    expect(renderToStaticMarkup(<TellClientCheckbox many checked onChange={() => {}} />)).toContain('Tell the clients by email')
  })
})

describe('TellClientConfirm', () => {
  it('asks the question with the box and both buttons', () => {
    const html = renderToStaticMarkup(<TellClientConfirm title="Cancel 3 bookings?" many defaultTell onConfirm={() => {}} onClose={() => {}} />)
    expect(html).toContain('Cancel 3 bookings?')
    expect(html).toContain('Tell the clients by email')
    expect(html).toContain('Yes')
    expect(html).toContain('Back')
  })
})

describe('the Service bookings page sends the box', () => {
  it('on create, the drawer save, the row confirm and the bulk cancel', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/ServiceBookings.tsx'), 'utf8')
    expect(src.match(/notify_client/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    expect(src).toContain('<TellClientConfirm')
    expect(src).not.toContain('window.confirm(confirmMsg)')
  })

  it('is said in all five languages', () => {
    for (const lang of ['en', 'ru', 'de', 'fr', 'es']) {
      const bundle = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../i18n/locales/${lang}/common.json`), 'utf8'))
      expect(Object.keys(bundle.tell_client).sort(), lang).toEqual(['back', 'bulk_cancel_title', 'cancel_title', 'confirm_title', 'go', 'no_email', 'tell', 'tell_many'])
    }
  })
})
