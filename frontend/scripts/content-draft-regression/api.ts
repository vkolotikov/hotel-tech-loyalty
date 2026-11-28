/* eslint-disable @typescript-eslint/no-explicit-any -- Delayed wire fixture intentionally accepts several endpoint payload shapes. */
export const audit = {
  settings: { timezone: 'Europe/Riga', timezone_named: true, timezones: ['Europe/Riga', 'Europe/Paris', 'Europe/Berlin'], locations_limit: 10, locations_used: 1 },
  team: [] as any[], media: [] as any[], failComment: false,
  holdPostRead: false, advanceRevision: false, revision: 0, holdLocations: false, failLocations: false,
  locations: [{ id: 7, name: 'Existing venue', address: '', city: '', country: '', timezone: 'UTC', email: '', phone: '', website: '', is_active: true }],
  work: null as any, failWorkStart: false, snippets: [] as any[], templates: [] as any[],
  requests: [] as any[], pending: [] as any[], posts: {} as Record<number, any>, postBrands: {} as Record<number, number>, holdBrandBPosts: false, failPostRead: false,
  bio: { page: null, buttons: [], suggested_name: 'fixture-brand', base_url: 'https://example.invalid/links/', url: null } as any,
  profile: { id: 1, name: 'Audit brand DNA', default_language: 'en', primary_goal: 'More bookings', setup_completed_at: '2026-10-01T09:00:00Z' },
}
export const brandPayload = () => ({ profile: audit.profile, audiences: [], channels: [{ id: 1, platform: 'linkedin', active: true, post_time: '09:00' }], voice: null, snippets: audit.snippets, templates: audit.templates, readiness: null })
export const makePost = (id: number, body: any = {}) => ({
  id, platform: 'linkedin', scheduled_date: '2026-11-13', scheduled_time: '09:00', status: 'draft',
  title: null, hook: '', topic: '', pillar_id: null, image_url: null, updated_at: '2026-11-13T06:00:00Z',
  language: 'en', goal: null, format: null, main_copy: '', short_copy: null, cta: null, hashtags: [],
  audience_id: null, campaign_id: null, weekday_role: null, funnel_stage: null, post_type: null, strategic_reason: null,
  quality: null, published_url: null, published_at: null, generated_by: 'manual', hook_alternatives: [], visual_brief: null,
  poster: null, group: null, series: null, timeline: [], ...body,
})
const answer = (data: any) => Promise.resolve({ data })
const log = (method: string, url: string, body?: any) => audit.requests.push({ method, url, body })
export const api = {
  get: (url: string) => {
    log('GET', url)
    if (url.includes('/campaigns')) return answer({ campaigns: [17, 18].map(id => ({ id, name: `Campaign ${id}`, goal: null, brief: null, start_date: null, end_date: null, status: 'active' })) })
    if (url.includes('/settings')) return answer({ ...audit.settings })
    if (url.includes('/locations')) {
      if (audit.failLocations) return Promise.reject(new Error('Locations unavailable'))
      if (audit.holdLocations) return new Promise(resolve => audit.pending.push({ method: 'GET', url, resolve, result: { locations: structuredClone(audit.locations) } }))
      return answer({ locations: audit.locations })
    }
    if (url.includes('/work')) return answer({ work: audit.work })
    if (url.includes('/media')) return answer({ media: audit.media, max_upload_bytes: 20971520 })
    if (url.includes('/strategies')) return answer({ strategies: [] })
    if (url.includes('/brand')) return answer(brandPayload())
    if (url.includes('/team')) return answer({ team: audit.team })
    if (url.includes('/site')) return answer({ site: null, pages: [], suggested_url: null })
    if (url.includes('/bio')) return answer(audit.bio)
    if (url.includes('/inbox/count')) return answer({ count: 0 })
    if (/\/posts\?/.test(url)) {
      const brand = Number(new URL(url, 'http://fixture.invalid').searchParams.get('brand_id'))
      if (brand === 4 && audit.holdBrandBPosts) return new Promise(resolve => audit.pending.push({ method: 'GET', url, resolve }))
      return answer({ data: [makePost(brand === 3 ? 301 : 401, { hook: brand === 3 ? 'Brand A exclusive post' : 'Brand B exclusive post' })], meta: { total: 1, pages: 1, page: 1 } })
    }
    const match = url.match(/\/posts\/(\d+)/)
    if (match) {
      if (audit.failPostRead) return Promise.reject({ response: { status: 502, data: { error: 'temporary' } } })
      const id = Number(match[1])
      const brand = Number(new URL(url, 'http://fixture.invalid').searchParams.get('brand_id'))
      if (audit.postBrands[id] && audit.postBrands[id] !== brand) return Promise.reject({ response: { status: 404, data: { error: 'not_found' } } })
      const post = audit.posts[id] ??= makePost(id)
      if (audit.holdPostRead) { audit.holdPostRead = false; return new Promise(resolve => audit.pending.push({ method: 'GET', url, resolve, result: { post: structuredClone(post) } })) }
      return answer({ post })
    }
    return answer({})
  },
  post: (url: string, body: any) => {
    log('POST', url, body)
    if (url.includes('/comments') && audit.failComment) return Promise.reject({ response: { status: 422, data: { errors: { media_id: ['Detached'] } } } })
    if (url.includes('/work') && audit.failWorkStart) return Promise.reject(new Error('Interrupted'))
    return new Promise((resolve, reject) => audit.pending.push({ method: 'POST', url, body, resolve, reject }))
  },
  put: (url: string, body: any) => {
    log('PUT', url, body)
    return new Promise(resolve => audit.pending.push({ method: 'PUT', url, body, resolve }))
  },
  delete: (url: string) => { log('DELETE', url); return new Promise(resolve => audit.pending.push({ method: 'DELETE', url, resolve })) },
}
export const API_BASE = '/api'
export const API_URL = ''
export const APP_BASE = ''
export const resolveImage = (value: string) => value
;(window as any).__auditData = audit
;(window as any).__seedReviewPost = (updated_at: string) => { audit.posts[301] = makePost(301, { status: 'needs_review', hook: 'Seen words', updated_at }) }
;(window as any).__refuseStaleAction = () => { audit.pending.shift().reject({ response: { status: 409, data: { error: 'changed_elsewhere', post: makePost(301, { hook: 'Unseen server words', updated_at: '2026-11-13T06:00:00.123457Z' }) } } }) }
;(window as any).__finish = (method?: string) => {
  const index = method ? audit.pending.findIndex(p => p.method === method) : 0
  const pending = index < 0 ? null : audit.pending.splice(index, 1)[0]
  if (!pending) throw new Error('No pending fixture request')
  if (pending.method === 'GET') { pending.resolve({ data: pending.result }); return }
  if (pending.url.includes('/settings')) { audit.settings = { ...audit.settings, ...pending.body }; pending.resolve({ data: { ...audit.settings } }); return }
  if (pending.url.includes('/comments')) {
    const id = Number(pending.url.match(/\/posts\/(\d+)/)?.[1])
    const post = audit.posts[id] ??= makePost(id)
    const comment = { id: 701, type: 'comment', body: pending.body.body, mine: true, edited: false, user: { id: 1, name: 'Audit Manager' }, at: '2026-11-13T06:00:00.123456Z', media: audit.media.find(m => m.id === pending.body.media_id) ?? null, mentions: audit.team.filter(m => pending.body.mentioned_user_ids.includes(m.id)) }
    const timeline = [...(post.timeline ?? []), comment]
    audit.posts[id] = { ...post, timeline, comments_count: timeline.length }
    pending.resolve({ data: { comment, comments_count: timeline.length } }); return
  }
  if (pending.url.includes('/locations')) { pending.resolve({ data: { location: { id: 7, ...pending.body }, locations: audit.locations } }); return }
  if (pending.url.includes('/work')) {
    audit.work = { id: pending.method === 'DELETE' ? audit.work.id : (audit.work?.id ?? 500) + 1, action: pending.body?.action ?? audit.work?.action, status: pending.method === 'DELETE' ? 'cancelled' : 'queued', post_id: 301, result: null, error: null, can_cancel: pending.method !== 'DELETE' }
    pending.resolve({ data: { work: audit.work } }); return
  }
  const snippet = pending.url.match(/\/brand\/snippets\/(\d+)/)
  if (snippet) { audit.snippets = audit.snippets.map(s => s.id === Number(snippet[1]) ? { ...s, ...pending.body } : s); pending.resolve({ data: brandPayload() }); return }
  const template = pending.url.match(/\/brand\/templates\/(\d+)/)
  if (template) { audit.templates = audit.templates.map(s => s.id === Number(template[1]) ? { ...s, ...pending.body } : s); pending.resolve({ data: { templates: audit.templates } }); return }
  if (pending.method === 'DELETE') { pending.resolve({ data: { deleted: true } }); return }
  if (pending.url.includes('/bio?')) {
    audit.bio = { ...audit.bio, page: { id: 1, ...pending.body }, buttons: pending.body.buttons.map((button: any, index: number) => ({ ...button, id: button.id ?? 77 + index })) }
    pending.resolve({ data: audit.bio }); return
  }
  if (pending.url.includes('/brand/profile')) {
    audit.profile = { ...audit.profile, ...pending.body }
    pending.resolve({ data: brandPayload() })
  } else {
    const id = pending.url.includes('/duplicate') ? 999 : Number(pending.url.match(/\/posts\/(\d+)/)?.[1] ?? 101)
    const post = makePost(id, { ...(audit.posts[id] ?? {}), ...pending.body })
    if (audit.advanceRevision && pending.method === 'PUT') post.updated_at = `2026-11-13T06:00:00.${String(++audit.revision).padStart(6, '0')}Z`
    audit.posts[id] = post
    audit.postBrands[id] = Number(new URL(pending.url, 'http://fixture.invalid').searchParams.get('brand_id'))
    pending.resolve({ data: { post } })
  }
}
