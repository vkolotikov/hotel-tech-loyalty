import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap, Can } from '../lib/types'
import { answerVerdict } from '../scan/verdict'
import { demoAnswer, demoTiers, SCENARIOS } from './demo'
import { GuidePage } from './GuidePage'
import { FAQ, FEATURES, STEPS, TOPICS, featuresFor, fold, narrow, type Say } from './guideMath'
import { DEMO_WORDS, FAQ_WORDS, FEATURE_WORDS } from './words'

const can = (more: Partial<Can> = {}): Can => ({
  award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false,
  manage_campaigns: false, manage_app: false, ...more,
})
const boot = (more: Partial<Can> = {}): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'other' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-26', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: 'staff', can: can(more) },
  programme: { on: true, tiers: [{ id: 1, name: 'Silver', color: '#9aa4b1', min_points: 0, is_active: true }, { id: 3, name: 'Platinum', color: '#6b21a8', min_points: 5000, is_active: true }, { id: 2, name: 'Gold', color: '#c9a227', min_points: 1000, is_active: true }] },
  counts: { members: 40, requests_waiting: 0 },
})

function render(node: ReactNode, data: Bootstrap = boot()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/loyalty/guide']}>
        <LoyaltyContext.Provider value={{ data, isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const english: Say = (_key, fallback) => fallback

describe('the Guide (owner 2026-10-26)', () => {
  it('opens with the search, the quick start in five steps, the features, Try a scan and the questions', () => {
    const html = render(<GuidePage />)
    const words = text(html)
    for (const part of ['Guide', 'Quick start', 'Set your tiers', 'Scan at the door', 'What you can do', 'Door mode', 'Try a scan', 'Questions', 'Getting started', 'Where do I start?']) {
      expect(words).toContain(part)
    }
    expect(html).toContain('placeholder="Search the guide"')
    expect(html.match(/data-guide-step=/g)).toHaveLength(5)
    expect(html.match(/data-guide-faq=/g)).toHaveLength(FAQ.length)
    // Each step and card opens the page where it is done.
    expect(html).toContain('href="/loyalty/program?tab=places"')
    expect(html).toContain('href="/loyalty/scan"')
  })

  it('shows only the cards for the pages this person’s menu has', () => {
    expect(featuresFor(can()).map(f => f.id)).not.toContain('campaigns')
    expect(featuresFor(can()).map(f => f.id)).not.toContain('insights')
    expect(featuresFor(can({ manage_campaigns: true, view_insights: true, manage_app: true })).map(f => f.id)).toEqual(FEATURES.map(f => f.id))
    const staff = render(<GuidePage />)
    expect(staff).not.toContain('data-guide-feature="campaigns"')
    expect(render(<GuidePage />, boot({ manage_campaigns: true }))).toContain('data-guide-feature="campaigns"')
  })

  it('the search keeps the cards and questions holding every word, accents and case aside, and the topic narrows the questions', () => {
    const features = featuresFor(can({ manage_campaigns: true, view_insights: true, manage_app: true }))
    expect(narrow('', 'all', features, english)).toEqual({ features: features.map(f => f.id), faq: FAQ.map(f => f.id) })
    expect(narrow('NFC', 'all', features, english).faq).toEqual(['how_scan', 'nfc'])
    expect(narrow('NFC', 'all', features, english).features).toEqual(['scan'])
    expect(narrow('door mode', 'all', features, english).faq).toEqual(['door'])
    expect(narrow('zzz', 'all', features, english)).toEqual({ features: [], faq: [] })
    expect(narrow('', 'events', features, english).faq).toEqual(['run_event', 'sign_up'])
    // A question is found by its topic's name too.
    expect(narrow('portal', 'all', features, english).faq).toContain('portal_card')
    expect(fold('Événements Ёлка')).toBe('evenements елка')
  })

  it('every step, card, topic and question has its words, and every question its topic', () => {
    for (const s of STEPS) expect(s.to.startsWith('/loyalty')).toBe(true)
    for (const f of FEATURES) expect(FEATURE_WORDS[`${f.id}_line`]).toBeTruthy()
    for (const q of FAQ) {
      expect(FAQ_WORDS[`${q.id}_q`]).toMatch(/\?$/)
      expect(FAQ_WORDS[`${q.id}_a`].length).toBeLessThan(160)
      expect(TOPICS).toContain(q.topic)
    }
    expect(new Set(FAQ.map(q => q.topic))).toEqual(new Set(TOPICS))
  })

  it('every page the Guide opens exists in the workspace', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../LoyaltyApp.tsx'), 'utf8')
    const routes = new Set([...app.matchAll(/path="([^"]+)"/g)].map(m => `/loyalty/${m[1]}`.replace(/\/$/, '')))
    routes.add('/loyalty')
    for (const to of [...STEPS.map(s => s.to), ...FEATURES.map(f => f.to), ...FAQ.flatMap(f => (f.to ? [f.to] : []))]) {
      expect(routes, to).toContain(to.split(/[?#]/)[0])
    }
  })
})

describe('Try a scan', () => {
  const say = (key: keyof typeof DEMO_WORDS) => DEMO_WORDS[key]
  const facts = { locale: 'en', today: '2026-10-26', nowWall: '2026-10-26T12:00', timeZone: 'Europe/Riga' }

  it('acts out the door’s four answers with the scan screen’s own words and the venue’s lowest and highest tiers', () => {
    const tiers = demoTiers(boot().programme.tiers, say)
    expect([tiers.low.name, tiers.top.name]).toEqual(['Silver', 'Platinum'])
    const views = SCENARIOS.map(s => answerVerdict(demoAnswer(s, tiers, say), facts))
    expect(views.map(v => v.tone)).toEqual(['granted', 'warning', 'denied', 'denied'])
    expect(views.map(v => v.headline.fallback)).toEqual(['Welcome', 'Welcome', 'No access', 'No access'])
    expect(views[1].reason?.vars).toEqual({ days: '3' })
    expect(views[2].reason?.vars).toMatchObject({ tiers: 'Platinum', tier: 'Silver', name: 'Alex' })
    expect(views[3].reason?.key).toBe('loyalty.door.reason.expired_plain')
    expect(views[0].benefits).toEqual(['Welcome drink', 'Priority booking'])
    expect(views[2].benefits).toEqual([])
  })

  it('a venue with fewer than two tiers gets two named in the reader’s language', () => {
    expect(demoTiers([{ id: 1, name: 'Members', color: null, min_points: 0, is_active: true }], say)).toMatchObject({ low: { name: 'Silver' }, top: { name: 'Gold' } })
  })

  it('waits for a pick, offering the four answers', () => {
    const words = text(render(<GuidePage />))
    for (const part of ['Welcome', 'Ends soon', 'Wrong tier', 'Ended', 'Pick an answer to try.', 'A demo: nothing is scanned or recorded.']) expect(words).toContain(part)
  })
})
