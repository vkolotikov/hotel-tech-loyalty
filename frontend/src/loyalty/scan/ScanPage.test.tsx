import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap } from '../lib/types'
import { NfcPanel, ScanPage, ScanTroubleNotice } from './ScanPage'
import { cameraAttempt, fieldAttempt, nfcAttempt } from './scanMath'

const boot: Bootstrap = {
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: 'staff', can: { award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false } },
  programme: { on: true, tiers: [] },
  counts: { members: 40, requests_waiting: 2 },
}

function render(node: ReactElement) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/loyalty/scan']}>
        <LoyaltyContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the Scan page (release 5)', () => {
  it('offers the camera, NFC and the USB reader as big buttons, and keeps the field for readers that type', () => {
    const html = render(<ScanPage />)
    const words = text(html)
    for (const way of ['Scan with camera', 'Tap NFC card', 'USB reader', 'Find']) expect(words).toContain(way)
    expect(html).toContain('placeholder="Scan or type…"')
    expect(html).toMatch(/<input[^>]*autofocus/i)
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3)
    // Nothing starts on its own: no camera, no NFC, no reader until a press.
    expect(html).not.toContain('<video')
    expect(words).not.toContain('Hold the card')
  })

  it('says plainly where NFC does not work, and what NFC is doing where it does', () => {
    expect(text(render(<NfcPanel state="unsupported" onStart={() => {}} onStop={() => {}} />)))
      .toContain('NFC works in Chrome on Android phones and tablets; on this device scan the QR code or type the number.')
    const listening = text(render(<NfcPanel state="listening" onStart={() => {}} onStop={() => {}} />))
    expect(listening).toContain('Hold the card flat against the back of the phone or tablet.')
    expect(listening).toContain('Stop NFC')
    expect(listening).not.toContain('Try NFC again')
    const denied = text(render(<NfcPanel state="denied" onStart={() => {}} onStop={() => {}} />))
    expect(denied).toContain('NFC is blocked for this site.')
    expect(denied).toContain('Try NFC again')
    expect(text(render(<NfcPanel state="off" onStart={() => {}} onStop={() => {}} />))).toContain('Turn NFC on in the device’s settings')
  })

  it('a card nobody has offers "Link this card"; one switched off says so and offers it too', () => {
    const tap = nfcAttempt('04:a2:b3:c4', [])!
    const unknown = text(render(<ScanTroubleNotice failure={{ status: 404, code: 'not_found', extra: {} }} attempt={tap} onLink={() => {}} />))
    expect(unknown).toContain('No member has this card yet.')
    expect(unknown).toContain('Link this card')

    const off = text(render(<ScanTroubleNotice failure={{ status: 404, code: 'inactive', extra: { card: 'off' } }} attempt={tap} onLink={() => {}} />))
    expect(off).toContain('This card was switched off.')
    expect(off).toContain('Link this card')
  })

  it('any other refusal says the scan’s own words and offers no link', () => {
    const number = text(render(<ScanTroubleNotice failure={{ status: 404, code: 'not_found', extra: {} }} attempt={fieldAttempt('LS-999999')} onLink={() => {}} />))
    expect(number).toContain('No member has this card or number.')
    expect(number).not.toContain('Link this card')

    const expired = text(render(<ScanTroubleNotice failure={{ status: 404, code: 'expired', extra: {} }} attempt={cameraAttempt('x')} onLink={() => {}} />))
    expect(expired).toContain('This QR code has expired.')
    expect(expired).not.toContain('Link this card')
  })
})
