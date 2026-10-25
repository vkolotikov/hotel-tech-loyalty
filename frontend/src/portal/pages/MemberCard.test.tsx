import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // i18next's plural pick, as far as English needs it: the one-form fallback for a count of 1.
    t: (_k: string, fallback?: string, opts?: Record<string, unknown>) => {
      let text = opts && opts.count === 1 && typeof opts.defaultValue_one === 'string' ? opts.defaultValue_one : (fallback ?? _k)
      for (const [k, v] of Object.entries(opts ?? {})) text = text.split(`{{${k}}}`).join(String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import type { PortalMember } from '../lib/types'
import { CARD_COUNTED, MemberCard, membershipPhrase, toGoPhrase, type CardProgress } from './MemberCard'

const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const
const bundle = (locale: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../i18n/portal.${locale}.json`), 'utf8')) as { home: Record<string, string> }

const member = (more: Partial<PortalMember> = {}): PortalMember => ({
  member_number: 'HL-2026-000030', name: 'Grace Hopper', tier: { id: 1, name: 'Silver', color_hex: '#9ca3af' },
  current_points: 200, lifetime_points: 200, referral_code: 'GRACE1',
  progress: { percentage: 20, points_needed: 800, next_tier: { id: 2, name: 'Gold' } },
  recent_activity: [], marketing_consent: false, email_notifications: true, push_notifications: true, member_since: '2026-01-05',
  user: { id: 9, name: 'Grace Hopper', email: 'grace@example.test', phone: null, language: 'en' }, benefits: [],
  ...more,
})

function render(m: PortalMember) {
  const client = new QueryClient()
  client.setQueryData(['portal-card'], { qr_svg: null, qr_image: null })
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemberCard member={m} loyalty currency="EUR" /></QueryClientProvider>)
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the membership on the portal card (release 8 §3)', () => {
  it('says until when the membership holds, or that it ended, and nothing without an end date', () => {
    expect(text(render(member({ membership: { valid_until: '2027-10-03', state: 'active' } })))).toContain('Member until 3 Oct 2027')
    expect(text(render(member({ membership: { valid_until: '2026-10-20', state: 'expiring' } })))).toContain('Member until 20 Oct 2026')
    const ended = render(member({ membership: { valid_until: '2026-10-03', state: 'expired' } }))
    expect(text(ended)).toContain('Your membership ended on 3 Oct 2026 — ask the team to renew')
    expect(ended).toContain('data-membership="expired"')

    expect(membershipPhrase({ valid_until: null, state: 'active' }, 'en')).toBeNull()
    expect(membershipPhrase({ valid_until: '2027-01-01', state: 'off' }, 'en')).toBeNull()
    expect(membershipPhrase(undefined, 'en')).toBeNull()
    expect(text(render(member()))).not.toContain('Member until')
  })

  it('reads progress in the programme’s terms', () => {
    expect(text(render(member()))).toContain('800 points to go')

    const visits: CardProgress = { percentage: 33, points_needed: 2, next_tier: { id: 2, name: 'Gold' }, by: 'visits', needed: 2 }
    expect(text(render(member({ progress: visits })))).toContain('2 more visits to go')
    const one: CardProgress = { ...visits, needed: 1, points_needed: 1 }
    expect(text(render(member({ progress: one })))).toContain('1 more visit to go')

    const spend: CardProgress = { percentage: 40, points_needed: 120, next_tier: { id: 2, name: 'Gold' }, by: 'spend', needed: 119.5 }
    expect(toGoPhrase(spend, 'EUR', 'en')).toEqual({ key: 'portal.home.spend_to_go', fallback: '{{amount}} to go', options: { amount: '€119.50' } })
    expect(text(render(member({ progress: spend })))).toContain('€119.50 to go')

    // A summary from before release 8 (no measure) is points, as it always was.
    expect(toGoPhrase({ percentage: 10, points_needed: 5, next_tier: null }, 'EUR', 'en')).toBeNull()
  })

  it('carries its phrases in all five bundles, each count phrase in its four forms', () => {
    for (const locale of LOCALES) {
      const home = bundle(locale).home
      for (const form of ['one', 'few', 'many', 'other']) expect(home[`visits_to_go_${form}`], `${locale} ${form}`).toContain('{{count}}')
      expect(home.spend_to_go, locale).toContain('{{amount}}')
      expect(home.membership_until, locale).toContain('{{day}}')
      expect(home.membership_ended, locale).toContain('{{day}}')
    }
    const en = bundle('en').home
    expect([en.visits_to_go_one, en.visits_to_go_other]).toEqual([...CARD_COUNTED.visits_to_go])
    expect(en.membership_until).toBe('Member until {{day}}')
    expect(en.membership_ended).toBe('Your membership ended on {{day}} — ask the team to renew')
    expect(en.spend_to_go).toBe('{{amount}} to go')
  })
})
