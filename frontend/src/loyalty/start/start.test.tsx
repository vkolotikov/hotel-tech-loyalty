import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap, Can } from '../lib/types'
import { MembersPage } from '../members/MembersPage'
import { NO_FILTERS } from '../members/membersQuery'
import { START_KEY, STEP_TO, knownSteps, nextStep, stillToDo, type StartAnswer } from './startMath'
import { StartCard, StartPage } from './StartPage'

const can = (manager: boolean): Can => ({ award: true, redeem: true, reverse: manager, manage_program: manager, manage_rewards: false, manage_members: manager, view_insights: false, manage_campaigns: manager, manage_app: manager })
const boot = (manager: boolean): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'beauty' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-26', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: manager ? 'manager' : 'staff', can: can(manager) },
  programme: { on: true, tiers: [] },
  counts: { members: 40, requests_waiting: 0 },
})
const answer = (done: Partial<Record<string, boolean>> = {}, counts: Partial<Record<string, number>> = {}): StartAnswer => {
  const steps = ['programme', 'tiers', 'ways', 'rewards', 'logo', 'member', 'scan'].map(key => ({ key, done: done[key] ?? false, count: counts[key] ?? 0 }))
  return { steps, done: steps.filter(s => s.done).length, total: steps.length }
}
function wrap(children: ReactNode, manager: boolean, data: StartAnswer | null, at = '/loyalty/start') {
  const client = new QueryClient()
  if (data) client.setQueryData(START_KEY, data)
  client.setQueryData(['loyalty', 'members', NO_FILTERS], { page: 1, pages: 1, total: 0, members: [], figures: { total: 0, active: 0, new_this_month: 0, average_points: 0, tiers: {} } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <LoyaltyContext.Provider value={{ data: boot(manager), isLoading: false, isError: false, error: null, refetch: () => {} }}>{children}</LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('"Start here" (release 10, owner 2026-10-26)', () => {
  it('places every step the server has, and each opens a page the workspace has', () => {
    const php = fs.readFileSync(path.resolve(__dirname, '../../../../app/Services/Loyalty/Setup/SetupProgress.php'), 'utf8')
    const steps = /STEPS = \[([^\]]+)\]/.exec(php)![1].match(/'([a-z]+)'/g)!.map(s => s.slice(1, -1))
    expect(steps).toEqual(['programme', 'tiers', 'ways', 'rewards', 'logo', 'member', 'scan'])
    expect(steps.filter(key => !STEP_TO[key])).toEqual([])
    const app = fs.readFileSync(path.resolve(__dirname, '../LoyaltyApp.tsx'), 'utf8')
    const routes = new Set([...app.matchAll(/path="([^"]+)"/g)].map(m => `/loyalty/${m[1]}`.replace(/\/$/, '')))
    routes.add('/loyalty')
    for (const to of Object.values(STEP_TO)) expect(routes, to).toContain(to.split(/[?#]/)[0])
    expect(routes).toContain('/loyalty/start')
  })

  it('leads to the first step not done, and leaves out a step it does not know', () => {
    const some = answer({ programme: true, tiers: true })
    expect(nextStep(some)?.key).toBe('ways')
    expect(stillToDo(some)).toBe(true)
    const all = answer({ programme: true, tiers: true, ways: true, rewards: true, logo: true, member: true, scan: true })
    expect(nextStep(all)).toBeNull()
    expect(stillToDo(all)).toBe(false)
    expect(stillToDo(undefined)).toBe(false)
    const unknown = { ...all, steps: [...all.steps, { key: 'future', done: false, count: 0 }] }
    expect(knownSteps(unknown).map(s => s.key)).not.toContain('future')
    expect(stillToDo(unknown)).toBe(false)
  })

  it('shows how far it is, then each step in order: done with a tick, the next one first in its colour', () => {
    const html = wrap(<StartPage />, true, answer({ programme: true, tiers: true }, { tiers: 3, ways: 2, member: 12 }))
    const words = text(html)
    expect(words).toContain('Get started Set your programme up step by step.')
    expect(html).toMatch(/data-progress="open" data-hue="tier"/)
    expect(words).toContain('2 of 7 done')
    expect(html).toMatch(/style="width:29%"/)
    expect([...html.matchAll(/data-step="([a-z]+)"/g)].map(m => m[1])).toEqual(['programme', 'tiers', 'ways', 'rewards', 'logo', 'member', 'scan'])
    expect(html).toMatch(/data-step="tiers" data-done="" data-hue="earn"/)
    expect(words).toContain('2. Set up your tiers Done 3 in use')
    // The next step is the one not done, in its colour, with "Do this next" opening its page.
    expect(html).toMatch(/data-step="ways" data-next="" data-hue="earn" class="[^"]*l-hue-card/)
    expect(words).toContain('3. Check how members earn 2 to fix')
    expect(html).toMatch(/href="\/loyalty\/options"[^>]*>Do this next<span class="sr-only"> Check how members earn<\/span>/)
    expect(html.match(/Do this next/g)).toHaveLength(1)
    // A step that counts nothing says no figure; one done says Done.
    expect(words).toContain('4. Add rewards What members spend their points on')
    expect(words).toContain('6. Add your first member 12 members')
    expect(html).toMatch(/href="\/loyalty\/app\?tab=app"/)
  })

  it('says when everything is set', () => {
    const words = text(wrap(<StartPage />, false, answer({ programme: true, tiers: true, ways: true, rewards: true, logo: true, member: true, scan: true })))
    expect(words).toContain('All set: your programme is ready')
    expect(words).toContain('Every step is done. The Guide answers what comes next.')
    expect(words).not.toContain('Do this next')
  })

  it('puts the card on Members for a manager while a step is left, with the next step and Continue', () => {
    const card = wrap(<MembersPage />, true, answer({ programme: true, tiers: true }), '/loyalty')
    expect(card).toMatch(/data-start-card="" data-hue="tier"/)
    expect(text(card)).toContain('Set up your programme: 2 of 7 done Next: Check how members earn Continue')
    expect(card).toContain('href="/loyalty/start"')
    // Release 7's wizard banner is the first step now, not a second card on Members.
    expect(card).not.toContain('data-setup-banner')
    // Nobody else sees it, and it goes once every step is done.
    expect(wrap(<MembersPage />, false, answer(), '/loyalty')).not.toContain('data-start-card')
    expect(wrap(<StartCard />, true, answer({ programme: true, tiers: true, ways: true, rewards: true, logo: true, member: true, scan: true }), '/loyalty')).toBe('')
  })
})
