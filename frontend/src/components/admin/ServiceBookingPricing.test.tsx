import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ServiceBookingPricing } from './ServiceBookingPricing'

function render(row: Parameters<typeof ServiceBookingPricing>[0]['row']) {
  return renderToStaticMarkup(
    <MemoryRouter><ServiceBookingPricing row={row} /></MemoryRouter>,
  )
}

describe('ServiceBookingPricing', () => {
  it('shows the portal badge, the member link and the discount line for a portal row', () => {
    const html = render({
      source: 'member_portal',
      member: { id: 7, name: 'Ann Guest', member_number: 'M-100' },
      list_amount: 30,
      discount: { amount: 6, label: 'Gold tier' },
      total_amount: 24,
      currency: 'EUR',
    })
    expect(html).toContain('Member portal')
    expect(html).toContain('href="/members/7"')
    expect(html).toContain('Ann Guest')
    expect(html).toContain('M-100')
    expect(html).toContain('List 30.00')
    expect(html).toContain('Discount −6.00')
    expect(html).toContain('Gold tier')
  })

  it('renders nothing but an empty wrapper for a widget row with no member and no discount', () => {
    const html = render({
      source: 'widget',
      member: null,
      list_amount: null,
      discount: null,
      total_amount: 50,
      currency: 'EUR',
    })
    expect(html).not.toContain('Member portal')
    expect(html).not.toContain('/members/')
    expect(html).not.toContain('List')
    expect(html).not.toContain('Discount')
  })

  it('does not show the portal badge for an admin-created booking', () => {
    const html = render({ source: 'admin', total_amount: 50, currency: 'EUR' })
    expect(html).not.toContain('Member portal')
  })
})
