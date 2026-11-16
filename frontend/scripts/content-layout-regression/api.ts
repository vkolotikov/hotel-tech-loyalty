import type { Bootstrap, BrandPayload, Goals, PlanPayload, Platform } from '../../src/content/lib/types'

const platforms: Platform[] = ['linkedin', 'instagram', 'tiktok', 'facebook', 'youtube']
const dates = Array.from({ length: 7 }, (_, i) => `2026-11-${16 + i}`)
const dense = new URLSearchParams(location.search).get('density') !== 'even'
const largeCounts = new URLSearchParams(location.search).get('counts') === 'large'
const denseDays: [number, Platform[]][] = [[0, platforms], [2, ['linkedin', 'instagram', 'facebook']], [4, platforms], [6, ['instagram']]]
const slots = dense
  ? denseDays.flatMap(([day, items]) => items.map(platform => ({ date: dates[day], platform })))
  : dates.flatMap((date, i) => [platforms[i % 5], platforms[(i + 1) % 5]].map(platform => ({ date, platform })))
const boot: Bootstrap = {
  name: 'HexaTech Content', organization: { id: 1, name: 'Fixture organisation', industry: 'services' },
  brand: { id: 3, name: 'Fixture brand', logo_url: null }, brands: [], accent: null,
  venue: { timezone: 'UTC', timezone_named: false, today: dates[0] },
  staff: { id: 1, name: 'Fixture Manager', role: 'manager', can_manage: true },
  profile: { id: 1, setup_completed: true, readiness: 80 }, ai: { status: 'under', percent: 10 },
  platforms: ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email'],
  statuses: ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived'], rewrites: ['shorter'],
}
const count = largeCounts ? 12345 : 0
const plan: PlanPayload = { posts: [], unscheduled: [], unscheduled_total: count, slots, key_dates: [], figures: { planned: count, ready: count, published: count, open_slots: slots.length } }
const brand: BrandPayload = {
  profile: {
    id: 1, name: 'Fixture brand', default_language: 'en', default_tone: null, primary_goal: null, secondary_goals: null,
    content_rules: null, brand_summary: null, usp: null, mission: null, brand_values: null, brand_promise: null,
    differentiators: null, proof_points: null, price_position: null, main_cta: null, important_links: null, positioning: null,
    key_messages: null, content_mix: null, weekly_rhythm: null, engagement_goals: null, visual_style: null, trend_mode: 'balanced',
    setup_step: null, knowledge_score: null, setup_completed_at: '2026-10-01T09:00:00Z', last_knowledge_sync_at: null,
    holiday_country: 'none', marketing_days: false, requires_approval: false,
  },
  channels: platforms.map((platform, i) => ({
    id: i + 1, platform, label: platform, url: null, goal: null, role: null, cta_style: null, visual_style: null,
    link_policy: null, tone_override: null, default_language: null, emoji_policy: null, hashtag_policy: null,
    posts_per_week: 3, preferred_formats: null, frequency: { mon: true, wed: true, fri: true }, audience_id: null, active: true, post_time: '09:00',
  })),
  audiences: [], voice: null, snippets: [], templates: [], readiness: null, holiday_country_guess: null,
}
const goals: Goals = { week: { from: dates[0], to: dates[6] }, platforms: platforms.map(platform => ({ platform, published: 0, target: 3, planned: 0 })), streak: { weeks: 0, current_met: false, at_risk: false, short_by: 0 } }
const responses: Record<string, unknown> = {
  bootstrap: boot,
  plan, brand, goals,
  pulse: { timezone: 'UTC', timezone_named: false, timezone_source: 'venue', now: '2026-11-16T09:00:00Z', today: dates[0], place: null, weather: null },
  generate: { status: 'idle' }, 'promotions/current': null, 'inbox/count': { count: 0 },
}
type Pending = { path: string; resolve: (value: { data: unknown }) => void }
const pending: Pending[] = []
const released = new Set<string>()
const requests: string[] = []
const held = new Set(['bootstrap', 'plan', 'brand', 'goals', 'pulse'])
const fixture = {
  requests,
  pending: () => pending.map(p => p.path),
  release: (...paths: string[]) => {
    for (const path of paths) released.add(path)
    for (let i = pending.length - 1; i >= 0; i--) {
      if (released.has(pending[i].path)) {
        const { path, resolve } = pending.splice(i, 1)[0]
        resolve({ data: responses[path] })
      }
    }
  },
}
Object.assign(window, { __layout: fixture })
export const api = {
  get: (url: string) => {
    const path = url.split('/content/')[1]?.split('?')[0]
    requests.push(path)
    if (!(path in responses)) throw new Error(`Unimplemented layout fixture GET: ${path}`)
    return held.has(path) && !released.has(path)
      ? new Promise<{ data: unknown }>(resolve => pending.push({ path, resolve }))
      : Promise.resolve({ data: responses[path] })
  },
}
