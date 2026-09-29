import { describe, expect, it } from 'vitest'
import { buildIcs } from './ics'
import type { PortalBooking } from './types'

const booking: PortalBooking = { kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: 'with Mara', starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z', status: 'confirmed', payment_status: 'unpaid', total: 60, currency: 'EUR', discount: null, can_cancel: false, cancel_deadline: null, notes: null, party_size: 1, guests: null, nights: null, paid_online: false }

describe('buildIcs', () => {
  it('writes a UTC event with the reference as its uid, CRLF ends and folded long lines', () => {
    const ics = buildIcs({ ...booking, notes: 'x'.repeat(120) }, { name: 'Numa', timezone: 'Europe/Riga' })
    expect(ics).toContain('BEGIN:VCALENDAR\r\n')
    expect(ics).toContain('UID:SVC-ABC12345@hexa-tech\r\n')
    expect(ics).toContain('DTSTART:20261003T073000Z\r\n')
    expect(ics).toContain('DTEND:20261003T081500Z\r\n')
    expect(ics).toContain('SUMMARY:Facial\r\n')
    expect(ics.split('\r\n').every(l => Buffer.byteLength(l, 'utf8') <= 75)).toBe(true)
    expect(ics).toContain('\r\n ') // a folded continuation
  })

  // The line break must be escaped exactly once (RFC 5545's \n), not twice, or a calendar app shows a
  // literal "\n" instead of starting a new line.
  it('writes each description line break as a single RFC 5545 \\n escape', () => {
    const ics = buildIcs(booking, { name: 'Numa', timezone: 'Europe/Riga' })
    expect(ics).toContain('DESCRIPTION:Reference SVC-ABC12345\\nwith Mara\r\n')
    expect(ics).not.toContain('\\\\n')
  })
})
