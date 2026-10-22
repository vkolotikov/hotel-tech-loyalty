import { describe, expect, it, vi } from 'vitest'

/**
 * Review finding 5: the appointment payment-intent call carries the Pay visit's Idempotency-Key, so a pay-at-venue
 * grant the server offers is bound to the one booking the confirm under that same key makes.
 */
const post = vi.fn<(url: string, body: unknown, config?: unknown) => Promise<{ data: object }>>(() => Promise.resolve({ data: {} }))
vi.mock('../../../lib/api', () => ({ api: { post: (url: string, body: unknown, config?: unknown) => post(url, body, config), get: vi.fn() } }))

describe('portalApi.paymentIntent', () => {
  it('sends the visit\'s Idempotency-Key when it has one, and nothing otherwise', async () => {
    const { portalApi } = await import('../../lib/portalApi')
    const body = { service_id: 11, start_at: '2026-10-05T10:00:00+03:00' }

    await portalApi.paymentIntent(body, 'visit-key-0001')
    expect(post).toHaveBeenLastCalledWith('/v1/member/portal/services/payment-intent', body, { headers: { 'Idempotency-Key': 'visit-key-0001' } })

    await portalApi.paymentIntent(body)
    expect(post).toHaveBeenLastCalledWith('/v1/member/portal/services/payment-intent', body, undefined)
  })
})
