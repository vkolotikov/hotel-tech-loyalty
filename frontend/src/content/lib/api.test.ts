import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ list: [] as { method: string; url: string; body?: unknown; config?: unknown }[], fail: null as unknown }))
vi.mock('../../lib/api', () => {
  const record = (method: string) => (url: string, a?: unknown, b?: unknown) => {
    const bodyless = method === 'get' || method === 'delete'
    calls.list.push({ method, url, body: bodyless ? undefined : a, config: bodyless ? a : b })
    return calls.fail ? Promise.reject(calls.fail) : Promise.resolve({ data: { ok: true } })
  }
  return { api: { get: record('get'), post: record('post'), put: record('put'), delete: record('delete') } }
})

import { contentApi, contentUrl, failureOf, onWorkspaceOff, postsParams } from './api'

const last = () => calls.list[calls.list.length - 1]

describe('contentUrl', () => {
  it('writes the brand into the address, or an empty one, so the full admin\'s request hook leaves it alone', () => {
    expect(contentUrl('plan', 7)).toBe('/v1/admin/content/plan?brand_id=7')
    expect(contentUrl('bootstrap', null)).toBe('/v1/admin/content/bootstrap?brand_id=')
    expect(contentUrl('find?q=a', 3)).toBe('/v1/admin/content/find?q=a&brand_id=3')
  })
})

describe('contentApi', () => {
  it('sends every call under the prefix, with its brand, and the plan range as parameters', async () => {
    calls.fail = null
    const api = contentApi(5)
    await api.plan('2026-10-05', '2026-10-11')
    expect(last()).toMatchObject({ method: 'get', url: '/v1/admin/content/plan?brand_id=5', config: { params: { from: '2026-10-05', to: '2026-10-11' } } })
    await api.savePost(9, { hook: 'New', updated_at: '2026-10-05T06:00:00.000000Z' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/posts/9?brand_id=5', body: { hook: 'New' } })
    await api.movePost(9, { updated_at: 'x', scheduled_date: null })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/posts/9/move?brand_id=5', body: { scheduled_date: null } })
    await api.fill('2026-10-07', 'instagram')
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/slots/fill?brand_id=5', body: { date: '2026-10-07', platform: 'instagram' } })
  })

  it('treats a generation that wrote nothing (503 with its report) as a result to show', async () => {
    const report = { status: 'failed', created_count: 0, posts: [], skipped: [], failed_windows: [{ start_date: '2026-10-05', end_date: '2026-10-11', reason: 'provider_unavailable' }] }
    calls.fail = { response: { status: 503, data: report } }
    await expect(contentApi(5).generate({ from: '2026-10-05', to: '2026-10-11', fill_empty_only: true })).resolves.toEqual(report)
    calls.fail = null
  })

  it('tells its listeners when a call is refused because Content was switched off, and still fails the call', async () => {
    const heard = vi.fn()
    const stop = onWorkspaceOff(heard)
    calls.fail = { response: { status: 403, data: { error: 'workspace_disabled', message: 'x' } } }
    await expect(contentApi(5).plan('2026-10-05', '2026-10-11')).rejects.toBeTruthy()
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
    calls.fail = null
  })
})

describe('failureOf', () => {
  it('reads the code, the post of a stale save, the fields of a refused form, and a missing answer', () => {
    expect(failureOf(null)).toEqual({ status: 0, code: '', message: '' })
    expect(failureOf(new Error('offline'))).toMatchObject({ status: 0, code: 'network' })
    expect(failureOf({ response: { status: 409, data: { error: 'changed_elsewhere', message: 'm', post: { id: 4 } } } }))
      .toMatchObject({ status: 409, code: 'changed_elsewhere', post: { id: 4 } })
    expect(failureOf({ response: { status: 422, data: { message: 'The hook field…', errors: { hook: ['too long'] } } } }))
      .toMatchObject({ status: 422, code: 'invalid', fields: { hook: ['too long'] } })
    expect(failureOf({ response: { status: 500, data: '<html>' } })).toMatchObject({ status: 500, code: 'unknown' })
  })

  it('reads the shared brand middleware\'s code, which sits in `code` beside a sentence in `error`', () => {
    const refusal = { response: { status: 403, data: { error: 'You do not have access to this brand.', message: 'You do not have access to this brand.', code: 'brand_not_allowed' } } }
    expect(failureOf(refusal).code).toBe('brand_not_allowed')
  })
})

describe('the Posts, Strategy and Brand calls', () => {
  it('send the posts filters that hold something, and only a page after the first', () => {
    const none = { q: '', status: '', platform: '', pillar_id: null, from: '', to: '', unscheduled: false, page: 1 } as const
    expect(postsParams(none)).toEqual({})
    expect(postsParams({ ...none, q: '  autumn ', status: 'draft', platform: 'instagram', pillar_id: 4, from: '2026-10-01', to: '2026-10-31', unscheduled: true, page: 3 }))
      .toEqual({ q: 'autumn', status: 'draft', platform: 'instagram', pillar_id: 4, from: '2026-10-01', to: '2026-10-31', unscheduled: 1, page: 3 })
  })

  it('reach each endpoint under the prefix with the brand', async () => {
    calls.fail = null
    const api = contentApi(5)
    await api.posts({ q: '', status: '', platform: '', pillar_id: null, from: '', to: '', unscheduled: false, page: 2 })
    expect(last()).toMatchObject({ method: 'get', url: '/v1/admin/content/posts?brand_id=5', config: { params: { page: 2 } } })
    await api.createStrategy('Focus on autumn')
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/strategies?brand_id=5', body: { instructions: 'Focus on autumn' } })
    await api.createStrategy(null)
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/strategies?brand_id=5', body: {} })
    await api.activateStrategy(8)
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/strategies/8/activate?brand_id=5' })
    await api.archiveStrategy(8)
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/strategies/8/archive?brand_id=5' })
    await api.saveProfile({ usp: 'Organic colour only' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/brand/profile?brand_id=5', body: { usp: 'Organic colour only' } })
    await api.saveVoice({ tone: 'warm' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/brand/voice?brand_id=5', body: { tone: 'warm' } })
    await api.createAudience({ name: 'Busy parents' })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/audiences?brand_id=5', body: { name: 'Busy parents' } })
    await api.updateAudience(3, { name: 'Busy parents 30+' })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/brand/audiences/3?brand_id=5' })
    await api.deleteAudience(3, false)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/brand/audiences/3?brand_id=5' })
    await api.deleteAudience(3, true)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/brand/audiences/3?confirm=1&brand_id=5' })
    await api.createChannel({ platform: 'instagram', label: 'Instagram' })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/channels?brand_id=5' })
    await api.updateChannel(6, { active: false })
    expect(last()).toMatchObject({ method: 'put', url: '/v1/admin/content/brand/channels/6?brand_id=5', body: { active: false } })
    await api.deleteChannel(6)
    expect(last()).toMatchObject({ method: 'delete', url: '/v1/admin/content/brand/channels/6?brand_id=5' })
    await api.quickSetup({ platforms: ['instagram'], intensity: 'standard' })
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/quick-setup?brand_id=5', body: { platforms: ['instagram'] } })
    await api.finishSetup()
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/setup?brand_id=5' })
    await api.refreshKnowledge()
    expect(last()).toMatchObject({ method: 'post', url: '/v1/admin/content/brand/refresh-knowledge?brand_id=5' })
  })

  it('carry the number of posts an audience in use has, for the question before removing it', () => {
    const failure = failureOf({ response: { status: 409, data: { error: 'audience_in_use', message: 'x', posts: 4 } } })
    expect(failure).toMatchObject({ status: 409, code: 'audience_in_use', posts: 4 })
    expect(failureOf({ response: { status: 409, data: { error: 'changed_elsewhere' } } })).not.toHaveProperty('posts')
  })
})
