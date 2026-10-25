import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // i18next's plural pick, as far as English needs it: the one-form fallback for a count of 1.
    // i18next's `replace` is the interpolation data when given (lib/plural.ts writes the number the language's way there).
    t: (_k: string, fallback?: string, opts?: Record<string, unknown>) => {
      let text = opts && opts.count === 1 && typeof opts.defaultValue_one === 'string' ? opts.defaultValue_one : (fallback ?? _k)
      const vars = (opts?.replace as Record<string, unknown> | undefined) ?? opts ?? {}
      for (const [k, v] of Object.entries(vars)) text = text.split(`{{${k}}}`).join(String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))
vi.mock('react-router-dom', () => ({ Link: ({ to, children, ...rest }: { to: string; children: unknown }) => <a href={to} {...rest}>{children as never}</a> }))

import type { PortalMember } from '../lib/types'
import { MemberCard } from './MemberCard'
import { CARD_COUNTED, MEMBERSHIP_WORDS, contrast, membershipPhrase, tierTone, toGoPhrase, type CardProgress } from './memberCardMath'

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
  it('says until when the membership holds, that it is ending or ended (with renew), and nothing without an end date', () => {
    expect(text(render(member({ membership: { valid_until: '2027-10-03', state: 'active' } })))).toContain('Member until 3 Oct 2027')
    const ending = render(member({ membership: { valid_until: '2026-10-20', state: 'expiring' } }))
    expect(text(ending)).toContain('Ends 20 Oct 2026 · ask the team to renew')
    expect(ending).toContain('text-p-warning')
    const ended = render(member({ membership: { valid_until: '2026-10-03', state: 'expired' } }))
    expect(text(ended)).toContain('Ended 3 Oct 2026 · ask the team to renew')
    expect(ended).toContain('data-membership="expired"')
    expect(ended).toContain('text-p-danger')

    expect(membershipPhrase({ valid_until: null, state: 'active' }, 'en')).toBeNull()
    expect(membershipPhrase({ valid_until: '2027-01-01', state: 'off' }, 'en')).toBeNull()
    expect(membershipPhrase(undefined, 'en')).toBeNull()
    expect(text(render(member()))).not.toContain('Member until')
  })

  it('reads progress in the programme’s terms, every number written the language’s way', () => {
    expect(text(render(member()))).toContain('800 points to go')
    const big = text(render(member({ current_points: 6412, lifetime_points: 6512, progress: { percentage: 30, points_needed: 3488, next_tier: { id: 2, name: 'Gold' } } })))
    expect(big).toContain('6,412')
    expect(big).toContain('6,512 earned all time')
    expect(big).toContain('3,488 points to go')
    const manyVisits: CardProgress = { percentage: 5, points_needed: 1200, next_tier: { id: 2, name: 'Gold' }, by: 'visits', needed: 1200 }
    expect(text(render(member({ progress: manyVisits })))).toContain('1,200 more visits to go')

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
    for (const [k, v] of Object.entries(MEMBERSHIP_WORDS)) expect(en[k], k).toBe(v)
    for (const locale of LOCALES) expect(bundle(locale).home.membership_expiring, locale).toContain('{{day}}')
    expect(en.spend_to_go).toBe('{{amount}} to go')
  })
})

describe('the tier on the dark card', () => {
  const TRACK = [34, 38, 43]
  const rgb = (css: string) => css.match(/\d+/g)!.map(Number)

  it('keeps the tier’s name in the text colour and its colour where the card can show it (3:1 at least)', () => {
    for (const hex of ['#4c1d95', '#4B0082', '#000000', '#0ea5e9', '#FFD700', '#9ca3af', '#fff']) {
      const tone = tierTone(hex)!
      expect(contrast(rgb(tone), TRACK), hex).toBeGreaterThanOrEqual(3)
    }
    expect(tierTone('#FFD700')).toBe('rgb(255 215 0)')
    expect(tierTone('purple')).toBeNull()
    expect(tierTone(null)).toBeNull()

    const html = render(member({ tier: { id: 3, name: 'Platinum', color_hex: '#4B0082' } }))
    const pill = html.match(/<span data-tier=""[^>]*>/)![0]
    expect(pill).toContain('text-p-text')
    expect(pill).not.toMatch(/(^|[^-])color:/)
  })
})

describe('the level’s benefits on the card', () => {
  const benefits = [
    { id: 4, name: 'Free hair mask', category: 'wellness', display: 'Once a month' },
    { id: 5, name: 'Member price on services', category: 'discount', display: '10 % off services' },
    { id: 6, name: 'Priority booking', category: 'access', display: null },
    { id: 7, name: 'Welcome drink', category: 'dining', display: null },
    { id: 8, name: 'Late check-out', category: 'something_new', display: null },
  ]

  it('shows the first four as chips with the rest counted, and leads to the Benefits tab', () => {
    const html = render(member({ benefits }))
    const words = text(html)
    expect(words).toContain('Your Silver benefits')
    expect(words).toContain('Free hair mask')
    expect(words).toContain('Welcome drink')
    expect(words).not.toContain('Late check-out')
    expect(words).toContain('+1')
    expect(html).toContain('href="/portal/rewards?tab=benefits"')
  })

  it('shows nothing without benefits, or where the venue runs no programme', () => {
    expect(render(member())).not.toContain('data-benefits')
    const client = new QueryClient()
    const off = renderToStaticMarkup(<QueryClientProvider client={client}><MemberCard member={member({ benefits })} loyalty={false} /></QueryClientProvider>)
    expect(off).not.toContain('data-benefits')
  })
})
