import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../../../resources/views/booking-widget.blade.php', import.meta.url), 'utf8')
const renderer = source.slice(source.indexOf('function renderSummary()'), source.indexOf('function renderExtras()'))
const base = { checkIn: '2026-11-10', checkOut: '2026-11-12', adults: 2, children: 1, step: 5, paymentEnabled: true,
  selectedUnit: { id: 101, name: 'Sea view', price_per_night: 100 }, selectedExtras: { breakfast: true },
  config: { extras: [{ id: 'breakfast', name: 'Breakfast', price: 5, price_type: 'per_person_night' }] } }
function summary(over: Record<string, unknown>): string {
  const blank = () => ''
  return runInNewContext(`${renderer};renderSummary()`, { state: { ...base, ...over }, nights: () => 2, getRoomImage: blank, esc: String, formatDate: String,
    formatCurrency: (v: number) => `EUR ${v}`, svgClipboard: blank, svgCalendarSmall: blank, svgMoon: blank, svgUsers: blank, svgBed: blank, svgStar: blank, svgLock: blank })
}
describe('the actual stay checkout summary renderer', () => {
  it('uses the server total and priced extra lines for a single room', () => {
    const html = summary({ quote: { room_total: 200, gross_total: 230, extras: [{ name: 'Breakfast', line_total: 30 }] } })
    expect(html).toContain('<span>Total</span><span>EUR 230</span>')
    expect(html).toContain('Breakfast</span><span>EUR 30')
  })
  it('shows both quoted room lines and the authoritative combined total', () => {
    const html = summary({ selectedUnit: null, selectedCombo: { total_price: 400 }, quote: { gross_total: 430, rooms: [{ unit_name: 'Room A', room_total: 200 }, { unit_name: 'Room B', room_total: 200 }], extras: [{ name: 'Breakfast', line_total: 30 }] } })
    expect(html).toContain('<span>Total</span><span>EUR 430</span>')
    expect(html).toContain('Room A</span><span>EUR 200')
    expect(html).toContain('Room B</span><span>EUR 200')
  })
  it('labels the prequote estimate and applies the configured guest and night multipliers', () => {
    expect(summary({ quote: null })).toContain('<span>Estimated total</span><span>EUR 230</span>')
  })
  it('does not replace an authoritative zero with a catalogue estimate', () => {
    expect(summary({ quote: { room_total: 0, gross_total: 0, extras: [] } })).toContain('<span>Total</span><span>EUR 0</span>')
  })
})
