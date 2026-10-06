import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ActionInfo, ActionKey, AppointmentDetail, ClientMessageInfo } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { TellClient } = await import('./TellClient')
const { Messages } = await import('./Messages')
const { messageLine } = await import('./messageLine')
const { ActionConfirm } = await import('./ActionConfirm')
const { panelReducer, CLOSED } = await import('./panelState')

const msg = (over: Partial<ClientMessageInfo>): ClientMessageInfo => ({ kind: 'booked', status: 'sent', reason: null, recipient: 'sophie@example.test', at: '2026-10-05T06:00:00+00:00', ...over })

describe('TellClient', () => {
  it('offers the box with the address, ticked as the venue says', () => {
    const on = renderToStaticMarkup(<TellClient email="sophie@example.test" checked onChange={() => {}} />)
    expect(on).toContain('Tell the client by email (sophie@example.test)')
    expect(on).toContain('checked=""')
    expect(renderToStaticMarkup(<TellClient email="sophie@example.test" checked={false} onChange={() => {}} />)).not.toContain('checked=""')
  })

  it('says the client will not be told when there is no address, and offers no box', () => {
    const html = renderToStaticMarkup(<TellClient email={null} checked onChange={() => {}} />)
    expect(html).toContain('No email address — the client will not be told.')
    expect(html).not.toContain('type="checkbox"')
  })
})

describe('messageLine', () => {
  it('says what happened to each message, by status and reason', () => {
    expect(messageLine(msg({}))).toMatchObject({ key: 'appointments.messages.sent', vars: { email: 'sophie@example.test' }, tone: 'success' })
    expect(messageLine(msg({ status: 'queued' }))).toMatchObject({ key: 'appointments.messages.sent' })
    expect(messageLine(msg({ status: 'skipped', reason: 'suppressed' }))).toMatchObject({ key: 'appointments.messages.reason.suppressed', tone: 'warning' })
    expect(messageLine(msg({ status: 'skipped', reason: 'not_requested' }))).toMatchObject({ key: 'appointments.messages.reason.not_requested', tone: 'info' })
    expect(messageLine(msg({ status: 'failed', reason: 'mail_error' }))).toMatchObject({ key: 'appointments.messages.reason.mail_error', tone: 'danger' })
  })
})

describe('Messages', () => {
  it('lists every message with its kind and what happened, and nothing when there are none', () => {
    const html = renderToStaticMarkup(<Messages messages={[msg({ kind: 'reminder', status: 'skipped', reason: 'no_recipient' }), msg({})]} zone="Europe/London" locale="en" />)
    expect(html).toContain('Reminder')
    expect(html).toContain('Not sent: no email address.')
    expect(html).toContain('Emailed to sophie@example.test.')
    expect(renderToStaticMarkup(<Messages messages={[]} zone="UTC" locale="en" />)).toBe('')
  })
})

describe('ActionConfirm', () => {
  const booking = { client: { name: 'Sophie', email: 'sophie@example.test' }, client_email: 'sophie@example.test', start: '2026-10-06T10:00', end: '2026-10-06T10:45' } as unknown as AppointmentDetail
  // As the server sends them: confirm and cancel ask about the client (Part F R8 — the box follows `message`).
  const action = (key: ActionKey): ActionInfo => ({ key, allowed: true, consequences: { payment: 'none', points: null, coupon: 'none', message: key === 'confirm' || key === 'cancel' ? 'ask' : 'none' } })
  const render = (key: ActionKey) => renderToStaticMarkup(
    <ActionConfirm booking={booking} action={action(key)} reason="" saving={false} error={null} tell onTell={() => {}} onReason={() => {}} onConfirm={() => {}} onBack={() => {}} />,
  )

  it('asks about the client on confirm and cancel, and no longer promises that nobody is told', () => {
    for (const key of ['confirm', 'cancel'] as const) {
      const html = render(key)
      expect(html, key).toContain('Tell the client by email (sophie@example.test)')
      expect(html, key).not.toContain('No message is sent to the client')
    }
  })

  it('asks nothing on the actions that send nothing, and a no-show still says nobody is told', () => {
    expect(render('complete')).not.toContain('Tell the client')
    const noShow = render('no_show')
    expect(noShow).not.toContain('Tell the client')
    expect(noShow).toContain('No message is sent to the client')
  })
})

describe('panel state', () => {
  it('carries what the client was told into the view, and forgets it on the next step', () => {
    const told = msg({ status: 'queued' })
    const created = panelReducer({ mode: 'create', draft: { date: '2026-10-06', time: '10:00', masterId: 1, serviceId: 1, client: null, source: 'admin', staffNotes: '' }, key: 'k', saving: true, error: null }, { type: 'created', id: 9, told })
    expect(created).toMatchObject({ mode: 'view', id: 9, told })
    const next = panelReducer(created, { type: 'startMove' })
    expect(next).toMatchObject({ told: null })
    expect(panelReducer(CLOSED, { type: 'openView', id: 3 })).toMatchObject({ told: null })
  })

  it('keeps what an action told the client on the summary it returns to', () => {
    const view = panelReducer(CLOSED, { type: 'openView', id: 3 })
    const confirming = panelReducer(view, { type: 'askConfirm', action: 'cancel' })
    const told = msg({ kind: 'cancelled', status: 'queued' })
    expect(panelReducer(confirming, { type: 'done', outcome: null, told })).toMatchObject({ sub: 'summary', told })
  })
})
