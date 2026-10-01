import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { method: string; url: string; body?: unknown; config?: unknown }[] = []
vi.mock('../../lib/api', () => {
  const record = (method: string) => (url: string, body?: unknown, config?: unknown) => {
    calls.push({ method, url, body, config })
    return Promise.resolve({ data: { affected: [], total: 0 } })
  }
  return { api: { get: record('get'), post: record('post'), patch: record('patch'), put: record('put'), delete: record('delete') } }
})

const { appointmentsApi, failureOf } = await import('./api')

beforeEach(() => { calls.length = 0 })

describe('setup calls', () => {
  it('a dry run asks with ?dry_run=1 and a save without it', async () => {
    await appointmentsApi.updateService(3, { price: 50 }, true)
    await appointmentsApi.updateService(3, { price: 50 })
    expect(calls.map(c => [c.method, c.url, c.config])).toEqual([
      ['patch', '/v1/admin/appointments/setup/services/3', { params: { dry_run: 1 } }],
      ['patch', '/v1/admin/appointments/setup/services/3', undefined],
    ])
  })

  it('hours go as the whole week', async () => {
    await appointmentsApi.saveHours(4, [{ day_of_week: 1, start_time: '09:00', end_time: '17:00' }], true)
    expect(calls[0]).toEqual({ method: 'put', url: '/v1/admin/appointments/setup/team/4/hours', body: { week: [{ day_of_week: 1, start_time: '09:00', end_time: '17:00' }] }, config: { params: { dry_run: 1 } } })
  })

  it('a refused form says which fields', () => {
    const failure = failureOf({ response: { status: 422, data: { message: 'The name field is required.', errors: { name: ['The name field is required.'] } } } })
    expect(failure.fields).toEqual({ name: ['The name field is required.'] })
    expect(failure.status).toBe(422)
  })
})
