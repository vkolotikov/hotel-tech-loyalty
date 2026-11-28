import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimeContext } from '../TimeProvider'
import type { Badge, Bootstrap, RankRow, Recognition, RecognitionMe, RecognitionMode } from '../lib/types'
import { Celebration, CheerView } from './Celebration'
import { ProgressBand, ProgressBandView } from './ProgressBand'
import { WinsPage, WinsView } from './WinsPage'
import type { Cheers } from './winsLogic'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const boot = (manager: boolean, recognition?: RecognitionMode): Bootstrap => ({
  name: 'HexaTech Time Planner',
  organization: { id: 7, name: 'Villa Riga', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-04' },
  features: { time_management: true, voice: false },
  ai: { status: 'ok', percent: 10, ready: true, state: 'ready' },
  staff: { id: 3, key: 'u3', name: 'Anna Berzina', role: manager ? 'manager' : 'staff', can: { plan_team: true, edit_people: manager, team_buckets: manager, manage_settings: manager, manage_templates: true } },
  settings: { window: { start: '09:00', end: '18:00' }, minutes_per_day: 480, days_per_week: 5, groups: [], channels: [], ...(recognition ? { recognition } : {}), daily_goal: 3 },
  counts: { today_open: 2, overdue: 0, pool: 0 },
})

const badge = (code: string, have: number, need: number): Badge => ({ code, earned: have >= need, have, need })
const BADGES: Badge[] = [
  badge('priority_hero', 1, 3), badge('goal_getter', 3, 3), badge('clean_sweep', 0, 1), badge('well_planned', 0, 3), { code: 'on_time', earned: false, have: 4, need: 5 },
  badge('timekeeper', 0, 5), badge('streak_3', 3, 3), badge('streak_7', 3, 7), badge('podium', 1, 1), badge('champion', 0, 1),
]

const me = (today: Partial<RecognitionMe['today']> = {}, week: Partial<RecognitionMe['week']> = {}, extra: Partial<RecognitionMe> = {}): RecognitionMe => ({
  person: 'u3', name: 'Anna Berzina',
  today: { planned: 4, done: 2, goal: 3, goal_met: false, sweep: false, day_planned: false, planned_pct: 45, important_done: 1, points: 46, ...today },
  week: { points: 182, done: 11, important: 1, on_time_pct: 91, clocked: 0, days_goal: 2, days_sweep: 0, days_planned: 0, rank: 2, of: 4, ...week },
  streak: 3, badges: BADGES, last_week: { points: 240, rank: 1, of: 4 },
  days: [
    { date: '2026-11-02', future: false, points: 76, planned: 3, done: 3, goal_met: true, sweep: true, day_planned: true },
    { date: '2026-11-03', future: false, points: 60, planned: 5, done: 4, goal_met: true, sweep: false, day_planned: false },
    { date: '2026-11-04', future: false, points: 46, planned: 4, done: 2, goal_met: false, sweep: false, day_planned: false },
    ...['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map(date => ({ date, future: true, points: 0, planned: 0, done: 0, goal_met: false, sweep: false, day_planned: false })),
  ],
  ...extra,
})

const row = (person: string, name: string, points: number, rank: number | null, extra: Partial<RankRow> = {}): RankRow => ({ person, name, manager: false, points, done: 6, rank, me: false, streak: 0, badges: 0, ...extra })
const RANKING: RankRow[] = [
  row('u9', 'Boris Ozols', 240, 1, { manager: true, streak: 5, badges: 4 }),
  row('u3', 'Anna Berzina', 182, 2, { me: true, streak: 3, badges: 3, done: 11 }),
  row('u5', 'Clara Liepa', 95, 3, { badges: 1 }),
  row('u6', 'Dainis Kalns', 20, 4),
]

const seen = (extra: Partial<Recognition> = {}): Recognition => ({
  mode: 'ranking', manager: false, today: '2026-11-04', week: { from: '2026-11-02', to: '2026-11-08' },
  rules: { points: { task: 5, quarter_hour: 1, time_cap: 12, important: 8, on_time: 3, clocked: 2, daily_goal: 20, clean_sweep: 25, day_planned: 10 }, daily_goal: 3, planned_share: 60, day_task_cap: 15, on_time_share: 90 },
  me: me(), ranking: RANKING, hidden: 0, ...extra,
})

function render(element: ReactElement, opts: { path?: string; boot?: Bootstrap; data?: Recognition } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  if (opts.data) qc.setQueryData(['time', 'recognition'], opts.data)
  const path = opts.path ?? '/time/wins'
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <TimeContext.Provider value={{ data: opts.boot ?? boot(false), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path={path} element={element} /></Routes>
        </TimeContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')

describe('My day’s band of progress', () => {
  it('shows the goal as a ring, what earns the next points, today’s and the week’s points, the streak and the place', () => {
    const html = render(<ProgressBandView data={seen()} />)
    const words = text(html)
    expect(html).toContain('aria-label="My progress"')
    expect(html).toContain('aria-label="Daily goal: 2 of 3 tasks done"')
    expect(html).toContain('data-goal-met="false"')
    expect(html).toContain('time-ring-accent')
    expect(html).toContain('stroke-dashoffset="33"')
    expect(words).toContain('Today’s goal')
    expect(words).toContain('1 more tasks to reach today’s goal')
    expect(words).toContain('Today: 46 points')
    expect(words).toContain('3 days in a row')
    expect(words).toContain('This week: 182 points')
    expect(words).toContain('Place 2 of 4')
    expect(words).toContain('Day planned: 45 %')
    expect(html).toContain('title="Plan at least 60 % of your working time for the planning bonus"')
    expect(html).toContain('href="/time/wins"')
    // The week as seven dots: a star for Monday's clean sweep, a tick for Tuesday's goal, today ringed.
    expect((html.match(/<li /g) ?? []).length).toBe(7)
    expect(html).toContain('Mon 2 Nov: everything done')
    expect(html).toContain('Tue 3 Nov: goal reached')
    expect(html).toContain('Wed 4 Nov: goal not reached')
    expect(html).toContain('Thu 5 Nov: still to come')
    expect((html.match(/ring-2 ring-a-accent/g) ?? []).length).toBe(1)
  })

  it('turns gold once the goal is met, and asks for the rest for a clean sweep', () => {
    const html = render(<ProgressBandView data={seen({ me: me({ done: 3, goal_met: true, day_planned: true, planned_pct: 72 }) })} />)
    const words = text(html)
    expect(html).toContain('data-goal-met="true"')
    expect(html).toContain('time-gold-wash')
    expect(html).toContain('time-ring-gold')
    expect(html).toContain('stroke-dashoffset="0"')
    expect(words).toContain('Daily goal reached')
    expect(words).toContain('Finish the last 1 tasks for a clean sweep')
    expect(words).toContain('Day planned: 72 %')
    // Met, the ring holds a tick (more may be done than the goal names); the count is the label's.
    expect(words).not.toContain('3/3')
    expect(html).toMatch(/lucide-check [^"]*time-gold-text time-pop/)
    expect(html).toContain('aria-label="Daily goal: 3 of 3 tasks done"')
  })

  it('says when everything is done, and asks to plan a day without tasks', () => {
    const swept = render(<ProgressBandView data={seen({ me: me({ planned: 4, done: 4, goal_met: true, sweep: true }) })} />)
    const done = text(swept)
    expect(done).toContain('Everything planned is done. Great work!')
    // A clean sweep puts a star in the ring.
    expect(swept).toMatch(/lucide-star [^"]*time-gold-text time-pop/)
    const empty = render(<ProgressBandView data={seen({ me: me({ planned: 0, done: 0, planned_pct: null, points: 0 }, { rank: null, of: null }, { streak: 0 }) })} />)
    expect(text(empty)).toContain('Plan your day to start earning points')
    // No streak, no place and no calendar figure to show: none is drawn.
    expect(text(empty)).not.toContain('in a row')
    expect(text(empty)).not.toContain('Place ')
    expect(text(empty)).not.toContain('Day planned')
  })

  it('tells nobody a place who is alone in the ranking, or told none', () => {
    expect(text(render(<ProgressBandView data={seen({ me: me({}, { rank: 1, of: 1 }) })} />))).not.toContain('Place ')
    expect(text(render(<ProgressBandView data={seen({ mode: 'own', me: me({}, { rank: null, of: null }) })} />))).not.toContain('Place ')
  })

  it('is not drawn when recognition is off, for someone outside the team list, or before the first answer', () => {
    expect(render(<ProgressBand />, { data: seen() })).toContain('aria-label="My progress"')
    expect(render(<ProgressBand />)).toBe('')
    expect(render(<ProgressBand />, { data: seen({ me: null }) })).toBe('')
    // Switched off while an earlier answer is still remembered: nothing of it is shown.
    expect(render(<ProgressBand />, { data: seen(), boot: boot(false, 'off') })).toBe('')
    expect(render(<ProgressBand />, { data: { mode: 'off', manager: false } })).toBe('')
  })
})

describe('Achievements', () => {
  it('shows my week: the points, the place, the streak, last week, each day and today’s goal', () => {
    const html = render(<WinsPage />, { data: seen() })
    const words = text(html)
    expect(words).toContain('Achievements')
    expect(html).toContain('aria-label="My week"')
    expect(words).toContain('This week · Mon 2 Nov – Sun 8 Nov')
    expect(words).toContain('182 points')
    expect(words).toContain('Place 2 of 4')
    expect(words).toContain('Last week: 240 points, place 1')
    expect(html).toContain('aria-label="Mon 2 Nov: 76 points"')
    expect(html).toContain('aria-label="Wed 4 Nov: 46 points"')
    expect(html).toContain('aria-label="Daily goal: 2 of 3 tasks done"')
    expect(words).toContain('Tasks finished 11')
    expect(words).toContain('On time 91 %')
    expect(words).toContain('Days with the goal 2')
    // A staff member gets no way to the settings.
    expect(html).not.toContain('tab=recognition')
  })

  it('draws the podium with the winner in the middle and the whole ranking under it, my row marked', () => {
    const html = render(<WinsView data={seen()} />)
    const words = text(html)
    expect(html).toContain('aria-label="The top three"')
    const podium = html.slice(html.indexOf('aria-label="The top three"'), html.indexOf('aria-label="This week’s ranking"'))
    expect([...podium.matchAll(/aria-label="(Place \d: [^"]+)"/g)].map(m => m[1])).toEqual(['Place 2: Anna Berzina, 182 points', 'Place 1: Boris Ozols, 240 points', 'Place 3: Clara Liepa, 95 points'])
    expect(podium).toContain('time-gold-fill')
    expect(podium).toContain('time-silver-fill')
    expect(podium).toContain('time-bronze-fill')
    expect(podium).toContain('time-rise-y')
    const table = html.slice(html.indexOf('<ol class="space-y-1.5"'))
    expect((table.slice(0, table.indexOf('</ol>')).match(/<li /g) ?? []).length).toBe(4)
    expect((html.match(/data-me="true"/g) ?? []).length).toBe(1)
    expect(words).toContain('Dainis Kalns')
    expect(words).toContain('20 points')
    expect(words).toContain('11 finished')
    expect(words).not.toContain('more colleagues')
  })

  it('shows the top three and my own place when the organisation shows no more, and says how many are not shown', () => {
    const html = render(<WinsView data={seen({ mode: 'podium', ranking: RANKING.slice(0, 3), hidden: 1 })} />)
    expect(text(html)).toContain('and 1 more colleagues')
    expect(text(html)).not.toContain('Dainis Kalns')
  })

  it('shows no ranking and no places to a staff member when everyone sees only their own points', () => {
    const own = seen({ mode: 'own', me: me({}, { rank: null, of: null }, { last_week: { points: 240, rank: null, of: null }, badges: BADGES.slice(0, 8) }), ranking: [row('u3', 'Anna Berzina', 182, null, { me: true })] })
    const html = render(<WinsView data={own} />)
    const words = text(html)
    expect(words).toContain('Your organisation keeps the ranking private')
    expect(html).not.toContain('aria-label="The top three"')
    expect(words).not.toContain('Place ')
    expect(words).toContain('Last week: 240 points')
    expect(words).not.toContain('On the podium')
    // A manager still sees the table in that mode.
    const manager = render(<WinsView data={seen({ mode: 'own', manager: true })} />)
    expect(manager).toContain('aria-label="The top three"')
    expect(text(manager)).not.toContain('keeps the ranking private')
  })

  it('says so when nobody has points yet, and when nobody else has work', () => {
    expect(text(render(<WinsView data={seen({ ranking: [] })} />))).toContain('Nobody has points this week yet')
    const alone = render(<WinsView data={seen({ ranking: [RANKING[1]] })} />)
    expect(text(alone)).toContain('Nobody else has work in the planner this week yet.')
    expect(alone).not.toContain('aria-label="The top three"')
  })

  it('lists my badges, the earned ones first in gold, the others with how far they have got', () => {
    const html = render(<WinsView data={seen()} />)
    const words = text(html)
    expect(words).toContain('3 of 10 earned. They are earned anew every week.')
    expect([...html.matchAll(/data-badge="(\w+)" data-earned="(true|false)"/g)].map(m => `${m[1]}:${m[2]}`).slice(0, 5))
      .toEqual(['goal_getter:true', 'streak_3:true', 'podium:true', 'on_time:false', 'streak_7:false'])
    expect((html.match(/class="time-medal[^"]*" data-earned="true"|data-earned="true" class="time-medal/g) ?? []).length).toBe(3)
    expect(words).toContain('Goal getter Reach the daily goal on 3 days of a week Earned')
    expect(words).toContain('Right on time Finish 5 or more tasks in a week, 90 % of them on their day or earlier 4 of 5')
    expect(words).toContain('Well planned Plan at least 60 % of your working time on 3 days of a week 0 of 3')
    expect(words).toContain('Unstoppable Reach the daily goal 7 days in a row 3 of 7')
  })

  it('shows a badge the bundles do not know yet by its own name', () => {
    const html = render(<WinsView data={seen({ me: me({}, {}, { badges: [...BADGES, { code: 'team_player', earned: true, have: 1, need: 1 }] }) })} />)
    expect(text(html)).toContain('team player')
    expect(html).toContain('data-badge="team_player"')
  })

  it('says how points are earned with the server’s figures', () => {
    const words = text(render(<WinsView data={seen()} />))
    expect(words).toContain('How points are earned')
    expect(words).toContain('+5 Every finished task')
    expect(words).toContain('+1 For each planned quarter of an hour of the task, up to 12 points')
    expect(words).toContain('+8 A high-priority task')
    expect(words).toContain('+20 The daily goal reached (3 finished in a day)')
    expect(words).toContain('+25 A clean sweep: everything planned for the day finished')
    expect(words).toContain('+10 A filled calendar: at least 60 % of your working time planned')
    expect(words).toContain('The best 15 tasks of a day count.')
  })

  it('tells someone outside the team list that they collect no points, and still shows the ranking', () => {
    const html = render(<WinsView data={seen({ me: null })} />)
    expect(text(html)).toContain('You are not on the planner’s team list')
    expect(html).toContain('aria-label="The top three"')
    expect(html).not.toContain('aria-label="My week"')
    expect(text(html)).not.toContain('Badges')
  })

  it('gives a manager the way to the settings, and says when recognition is off', () => {
    expect(render(<WinsPage />, { data: seen({ manager: true }), boot: boot(true) })).toContain('href="/time/settings?tab=recognition"')
    const off = render(<WinsPage />, { boot: boot(false, 'off'), data: seen() })
    expect(text(off)).toContain('Recognition is switched off')
    expect(text(off)).toContain('Your organisation does not use points, badges and the ranking.')
    expect(off).not.toContain('aria-label="My week"')
    expect(text(render(<WinsPage />, { boot: boot(true, 'off') }))).toContain('You can switch it on in Settings.')
  })
})

describe('the characters in the screens', () => {
  const withBuddy = (buddy: string | null, choice: string | null = buddy, today: Partial<RecognitionMe['today']> = {}, week: Partial<RecognitionMe['week']> = {}) =>
    seen({ buddies: true, me: me(today, week, { buddy, buddy_choice: choice }), ranking: RANKING.map((r, i) => ({ ...r, buddy: ['pip', buddy, 'ember', null][i] })) })

  it('stands my character in the band’s ring in the mood of the day, the count on a pill under it', () => {
    const html = render(<ProgressBandView data={withBuddy('hexi')} />)
    expect(html).toContain('data-buddy-ring="hexi"')
    expect(html).toMatch(/<svg viewBox="0 0 120 120" width="60" height="60"[^>]*data-kind="hexi" data-mood="busy"/)
    expect(html).toContain('aria-label="Daily goal: 2 of 3 tasks done"')
    // The ring is larger to hold it, and the count moved to the pill.
    expect(html).toMatch(/role="img" aria-label="Daily goal: 2 of 3 tasks done"[^>]*style="width:80px;height:80px"/)
    expect(html).toMatch(/absolute -bottom-2[^>]*>2\/3<\/span>/)
    expect(html).not.toContain('data-crown')

    const met = render(<ProgressBandView data={withBuddy('miu', 'miu', { done: 3, goal_met: true }, { rank: 1, of: 4 })} />)
    expect(met).toMatch(/data-kind="miu" data-mood="proud" data-crown="true"/)
    expect(met).toMatch(/absolute -bottom-2[^>]*time-gold-fill[^>]*><svg[^>]*lucide-check[^>]*>.*?<\/svg>3<\/span>/)
    expect(render(<ProgressBandView data={withBuddy('pip', 'pip', { planned: 0, done: 0, planned_pct: null })} />)).toContain('data-mood="sleepy"')
    expect(render(<ProgressBandView data={withBuddy('pip', 'pip', { planned: 4, done: 4, goal_met: true, sweep: true })} />)).toContain('data-mood="party"')
  })

  it('keeps the plain ring for someone without a character, or where the organisation shows none', () => {
    for (const data of [withBuddy(null, 'none'), { ...withBuddy('hexi'), buddies: false }, withBuddy('dragon')]) {
      const html = render(<ProgressBandView data={data} />)
      expect(html).not.toContain('data-buddy-ring')
      expect(html).not.toContain('time-buddy')
      expect(html).toMatch(/style="width:64px;height:64px"/)
      expect(text(html)).toContain('2/3')
    }
  })

  it('lets my character say the day’s sentence on Achievements, in a bubble opened by its call', () => {
    const html = render(<WinsView data={withBuddy('ember')} />)
    expect(html).toContain('data-buddy-ring="ember"')
    expect(html).toMatch(/width="104" height="104"[^>]*data-kind="ember" data-mood="busy"/)
    expect(html).toMatch(/data-says="busy" class="min-w-0 px-3\.5 py-2\.5 time-bubble"/)
    expect(text(html)).toContain('Nice! 1 more tasks to reach today’s goal')
    // Without a character the words stand as they did, with no bubble and no call.
    const plain = render(<WinsView data={withBuddy(null, 'none')} />)
    expect(plain).not.toContain('time-bubble')
    expect(plain).not.toContain('data-says')
    expect(text(plain)).not.toContain('Nice!')
    expect(text(plain)).toContain('1 more tasks to reach today’s goal')
  })

  it('stands the team’s characters on the podium — the winner crowned and celebrating — and beside the names', () => {
    const html = render(<WinsView data={withBuddy('hexi')} />)
    const podium = html.slice(html.indexOf('aria-label="The top three"'), html.indexOf('aria-label="This week’s ranking"'))
    expect([...podium.matchAll(/data-kind="(\w+)" data-mood="(\w+)"( data-crown="true")?/g)].map(m => `${m[1]}:${m[2]}${m[3] ? ':crown' : ''}`))
      .toEqual(['hexi:proud', 'pip:party:crown', 'ember:proud'])
    // The crown is the winner's character's: no second one over it.
    expect(podium).not.toContain('lucide-crown')
    const table = html.slice(html.indexOf('<ol class="space-y-1.5"'))
    const rows = table.slice(0, table.indexOf('</ol>'))
    expect([...rows.matchAll(/width="34" height="34"[^>]*data-kind="(\w+)"[^>]*data-still="true"/g)].map(m => m[1])).toEqual(['pip', 'hexi', 'ember'])
    // The fourth has no character: initials, as before.
    expect((rows.match(/<span aria-hidden="true" class="grid shrink-0 place-items-center rounded-full font-semibold h-7 w-7/g) ?? []).length).toBe(1)

    // An answer that says nothing of characters (an older server): the podium is initials under the crown, and nothing is offered.
    const none = render(<WinsView data={seen()} />)
    expect(none).not.toContain('time-buddy')
    expect(none).toContain('lucide-crown')
  })

  it('offers the choice of a character, the one in use marked, and "no character" for a choice of none', () => {
    const html = render(<WinsView data={withBuddy('ember', null)} />)
    expect(text(html)).toContain('Your buddy')
    expect(text(html)).toContain('Your colleagues see it beside your name.')
    // Never chosen: the one the account was given is the one in use.
    expect([...html.matchAll(/role="radio" aria-checked="(true|false)" data-buddy="(\w+)"/g)].map(m => `${m[2]}:${m[1]}`))
      .toEqual(['hexi:false', 'pip:false', 'miu:false', 'ember:true', 'none:false'])
    const picker = html.slice(html.indexOf('role="radiogroup" aria-label="Your buddy"'), html.indexOf('aria-label="The top three"'))
    expect((picker.match(/Yours/g) ?? []).length).toBe(1)
    for (const name of ['Hexi', 'Pip', 'Miu', 'Ember', 'No character']) expect(text(picker)).toContain(name)
    // The one in use moves; the others wait.
    expect(picker).toMatch(/data-kind="ember" data-mood="proud" class/)
    expect((picker.match(/data-still="true"/g) ?? []).length).toBe(3)

    const none = render(<WinsView data={withBuddy(null, 'none')} />)
    expect([...none.matchAll(/role="radio" aria-checked="(true|false)" data-buddy="(\w+)"/g)].map(m => `${m[2]}:${m[1]}`))
      .toEqual(['hexi:false', 'pip:false', 'miu:false', 'ember:false', 'none:true'])
  })

  it('offers no choice where the organisation shows no characters, or to someone outside the team list', () => {
    expect(render(<WinsView data={{ ...withBuddy('ember'), buddies: false }} />)).not.toContain('data-buddy=')
    expect(render(<WinsView data={{ ...withBuddy('ember'), buddies: false }} />)).not.toContain('time-buddy')
    expect(render(<WinsView data={seen({ me: null, buddies: true })} />)).not.toContain('data-buddy=')
  })
})

describe('a celebration', () => {
  const cheers = (main: Cheers['main'], extra: Partial<Cheers> = {}): Cheers => ({ main, also: [], points: 28, streak: 3, of: 4, done: 3, ...extra })
  const rules = seen().rules

  it('says the daily goal is reached, with the points, the streak and confetti', () => {
    const html = render(<CheerView cheers={cheers({ kind: 'goal', big: true })} rules={rules} onClose={() => {}} />)
    const words = text(html)
    expect(html).toContain('data-cheer="goal"')
    expect(html).toContain('time-cheer')
    expect(words).toContain('Daily goal reached!')
    expect(words).toContain('Everything you finish after it still earns points.')
    expect(words).toContain('+28 points')
    expect(words).toContain('3 days in a row')
    expect(html).toContain('href="/time/wins"')
    expect(html).toContain('aria-label="Close"')
    expect((html.match(/class="time-confetti"/g) ?? []).length).toBe(44)
    expect(html).toContain('data-confetti=""')
    // The shower is decoration, and never in the way of a press.
    expect(html).toMatch(/aria-hidden="true" data-confetti="" class="pointer-events-none/)
  })

  it('names a new badge with its medal, and how many more arrived', () => {
    const html = render(<CheerView cheers={cheers({ kind: 'badge', badge: 'streak_3', more: 2, big: true })} rules={rules} onClose={() => {}} />)
    const words = text(html)
    expect(words).toContain('New badge: On a roll')
    expect(words).toContain('and 2 more badges')
    expect(html).toContain('data-earned="true"')
  })

  it('names what else came with the moment, two at most', () => {
    const html = render(<CheerView cheers={cheers({ kind: 'badge', badge: 'on_time', big: true }, { also: ['lead', 'sweep', 'goal'] })} rules={rules} onClose={() => {}} />)
    const also = html.slice(html.indexOf('data-cheer-also'), html.indexOf('</ul>'))
    expect((also.match(/<li /g) ?? []).length).toBe(2)
    expect(text(also)).toContain('You lead the week!')
    expect(text(also)).toContain('Clean sweep!')
    expect(text(also)).not.toContain('Daily goal reached!')
    expect(render(<CheerView cheers={cheers({ kind: 'goal', big: true })} rules={rules} onClose={() => {}} />)).not.toContain('data-cheer-also')
  })

  it('names the lead with how many it is among, and a clean sweep', () => {
    const lead = text(render(<CheerView cheers={cheers({ kind: 'lead', big: true })} rules={rules} onClose={() => {}} />))
    expect(lead).toContain('You lead the week!')
    expect(lead).toContain('First place of 4. Keep it up.')
    expect(text(render(<CheerView cheers={cheers({ kind: 'sweep', big: true })} rules={rules} onClose={() => {}} />))).toContain('Clean sweep!')
  })

  it('keeps the smaller moments to a card without confetti, and the streak chip to a real streak', () => {
    const html = render(<CheerView cheers={cheers({ kind: 'important', big: false }, { streak: 1 })} rules={rules} onClose={() => {}} />)
    expect(text(html)).toContain('Important task done')
    expect(html).not.toContain('time-confetti')
    expect(text(html)).not.toContain('in a row')
    expect(text(render(<CheerView cheers={cheers({ kind: 'planned', big: false })} rules={rules} onClose={() => {}} />))).toContain('Your day is well planned')
  })

  it('shows only the points for a plain task, as decoration', () => {
    const html = render(<CheerView cheers={cheers(null, { points: 12 })} rules={rules} onClose={() => {}} />)
    expect(html).toContain('data-cheer="points"')
    expect(text(html)).toContain('+12 points')
    expect(html).toContain('time-float-up')
    expect(html).not.toContain('time-confetti')
    expect(html).not.toContain('time-cheer')
  })

  it('lets my character cheer on the card, holding what was earned, and come up for the big moments', () => {
    const big = render(<CheerView cheers={cheers({ kind: 'badge', badge: 'on_time', big: true }, { also: ['lead'] })} rules={rules} buddy="miu" onClose={() => {}} />)
    expect(big).toMatch(/data-cheer-buddy="miu"[^>]*><svg[^>]*width="68" height="68"[^>]*data-kind="miu" data-mood="party" data-crown="true"/)
    // The medal is in its hand, small; the cameo comes up from the foot of the screen.
    expect(big).toMatch(/absolute -bottom-1 -right-2"><span aria-hidden="true" data-earned="true" class="time-medal shrink-0 h-9 w-9"/)
    expect(big).toMatch(/aria-hidden="true" data-cameo="miu" class="pointer-events-none fixed bottom-0[^"]*"><svg[^>]*width="148" height="148"[^>]*class="time-buddy shrink-0 time-buddy-peek"/)

    const small = render(<CheerView cheers={cheers({ kind: 'important', big: false })} rules={rules} buddy="pip" onClose={() => {}} />)
    expect(small).toMatch(/data-kind="pip" data-mood="proud" class/)
    expect(small).not.toContain('data-cameo')
    expect(small).not.toContain('data-crown')

    // Without a character the card is as it was; a plain task's points bring no character.
    const none = render(<CheerView cheers={cheers({ kind: 'goal', big: true })} rules={rules} onClose={() => {}} />)
    expect(none).not.toContain('time-buddy')
    expect(none).toContain('class="time-medal shrink-0 h-12 w-12"')
    expect(render(<CheerView cheers={cheers(null, { points: 12 })} rules={rules} buddy="hexi" onClose={() => {}} />)).not.toContain('time-buddy')
  })

  it('starts quiet: the first answer of a session is only the starting line, with a status line ready for what comes', () => {
    const html = render(<Celebration />, { data: seen() })
    expect(html).toBe('<p role="status" class="sr-only"></p>')
  })
})
