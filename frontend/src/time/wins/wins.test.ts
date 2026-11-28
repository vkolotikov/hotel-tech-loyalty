import { describe, expect, it } from 'vitest'
import type { Badge, RankRow, Recognition, RecognitionDay, RecognitionMe } from '../lib/types'
import { AREAS, areaOf, areasFor } from '../shell/nav'
import en from '../i18n/wins.en.json'
import settingsEn from '../i18n/settings.en.json'
import { confettiLength, confettiPieces } from './confetti'
import {
  BADGE_CODES, CHEER_KINDS, MODES, RULE_CODES, badgePct, cheersBetween, dayHeights, dotOf, earnedCount, goalPct, goalValue, isBadgeCode, modeOf, nextBadge,
  nextStep, podiumOf, rankingView, ruleRows, shareOf, sortBadges,
} from './winsLogic'
import { BADGE_WORDS, CHEER_WORDS, MODE_WORDS, RULE_WORDS } from './words'

const day = (date: string, extra: Partial<RecognitionDay> = {}): RecognitionDay => ({ date, future: false, points: 0, planned: 0, done: 0, goal_met: false, sweep: false, day_planned: false, ...extra })
const badge = (code: string, have: number, need: number, earned = have >= need): Badge => ({ code, earned, have, need })
const row = (person: string, points: number, rank: number | null, extra: Partial<RankRow> = {}): RankRow => ({ person, name: person, manager: false, points, done: 1, rank, me: false, streak: 0, badges: 0, ...extra })

const BADGES: Badge[] = [
  badge('priority_hero', 1, 3), badge('goal_getter', 2, 3), badge('clean_sweep', 0, 1), badge('well_planned', 0, 3), badge('on_time', 2, 5),
  badge('timekeeper', 0, 5), badge('streak_3', 2, 3), badge('streak_7', 2, 7), badge('podium', 0, 1), badge('champion', 0, 1),
]

const me = (extra: Partial<RecognitionMe> = {}, today: Partial<RecognitionMe['today']> = {}, week: Partial<RecognitionMe['week']> = {}): RecognitionMe => ({
  person: 'u3', name: 'Anna Berzina',
  today: { planned: 4, done: 2, goal: 3, goal_met: false, sweep: false, day_planned: false, planned_pct: 40, important_done: 0, points: 24, ...today },
  week: { points: 120, done: 9, important: 1, on_time_pct: 89, clocked: 0, days_goal: 2, days_sweep: 0, days_planned: 0, rank: 2, of: 4, ...week },
  streak: 2, badges: BADGES, last_week: { points: 200, rank: 1, of: 4 },
  days: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map(d => day(d, { future: d > '2026-11-04' })),
  ...extra,
})

const seen = (mine: RecognitionMe | null, extra: Partial<Recognition> = {}): Recognition => ({
  mode: 'ranking', manager: false, today: '2026-11-04', week: { from: '2026-11-02', to: '2026-11-08' },
  rules: { points: { task: 5, quarter_hour: 1, time_cap: 12, important: 8, on_time: 3, clocked: 2, daily_goal: 20, clean_sweep: 25, day_planned: 10 }, daily_goal: 3, planned_share: 60, day_task_cap: 15, on_time_share: 90 },
  me: mine, ranking: [], hidden: 0, ...extra,
})

describe('who sees the ranking, and the daily goal a manager types', () => {
  it('reads the organisation’s choice, the top three and one’s own place where none was made', () => {
    expect(MODES.map(modeOf)).toEqual(['ranking', 'podium', 'own', 'off'])
    expect([modeOf(undefined), modeOf('everyone'), modeOf(null)]).toEqual(['podium', 'podium', 'podium'])
  })

  it('takes a whole number from 1 to 20 as the goal and nothing else', () => {
    expect(['1', ' 3 ', '20'].map(goalValue)).toEqual([1, 3, 20])
    expect(['0', '21', '2.5', '', 'three', '-1', '003'].map(goalValue)).toEqual([null, null, null, null, null, null, null])
  })
})

describe('today', () => {
  it('fills the ring by the tasks done, and to the brim only when the server says the goal is met', () => {
    expect(goalPct(me().today)).toBe(67)
    expect(goalPct(me({}, { done: 0 }).today)).toBe(0)
    // A day of two long tasks, both done, on a well-filled calendar: met with fewer tasks than the goal names.
    expect(goalPct(me({}, { done: 2, planned: 2, goal_met: true }).today)).toBe(100)
    // Never full before it is met, whatever the arithmetic says.
    expect(goalPct(me({}, { done: 3, goal: 3, goal_met: false }).today)).toBe(99)
    expect(goalPct(me({}, { goal: 0 }).today)).toBe(0)
  })

  it('names what earns the next points: plan, reach the goal, finish the rest, or nothing more', () => {
    expect(nextStep(me({}, { planned: 0, done: 0 }).today)).toEqual({ code: 'plan' })
    expect(nextStep(me().today)).toEqual({ code: 'goal', left: 1 })
    expect(nextStep(me({}, { done: 0 }).today)).toEqual({ code: 'goal', left: 3 })
    expect(nextStep(me({}, { done: 3, goal_met: true }).today)).toEqual({ code: 'sweep', left: 1 })
    expect(nextStep(me({}, { done: 4, goal_met: true, sweep: true }).today)).toEqual({ code: 'done' })
    // Everything done on a day too small for a clean sweep: nothing is left to ask for.
    expect(nextStep(me({}, { planned: 3, done: 3, goal_met: true, sweep: false }).today)).toEqual({ code: 'done' })
  })
})

describe('the week', () => {
  it('reads each day as still to come, without tasks, open, the goal met or everything done', () => {
    expect(dotOf(day('2026-11-05', { future: true, planned: 3 }))).toBe('future')
    expect(dotOf(day('2026-11-02'))).toBe('empty')
    expect(dotOf(day('2026-11-02', { planned: 2, done: 1 }))).toBe('open')
    expect(dotOf(day('2026-11-02', { planned: 4, done: 3, goal_met: true }))).toBe('goal')
    expect(dotOf(day('2026-11-02', { planned: 3, done: 3, goal_met: true, sweep: true }))).toBe('sweep')
  })

  it('draws each day against the best one, with a sliver for a day that earned a little', () => {
    expect(dayHeights([day('a', { points: 100 }), day('b', { points: 50 }), day('c'), day('d', { points: 2 })])).toEqual([100, 50, 0, 8])
    expect(dayHeights([day('a'), day('b')])).toEqual([0, 0])
  })
})

describe('badges', () => {
  it('knows the badges the bundles have words for', () => {
    expect(BADGE_CODES).toHaveLength(10)
    expect(isBadgeCode('champion')).toBe(true)
    expect(isBadgeCode('team_player')).toBe(false)
  })

  it('puts the earned ones first, then the nearest, and names the next one under way', () => {
    const mine = [badge('priority_hero', 1, 3), badge('goal_getter', 3, 3), badge('on_time', 4, 5, false), badge('timekeeper', 0, 5), badge('streak_3', 3, 3)]
    expect(sortBadges(mine).map(b => b.code)).toEqual(['goal_getter', 'streak_3', 'on_time', 'priority_hero', 'timekeeper'])
    expect(earnedCount(mine)).toBe(2)
    expect(nextBadge(mine)?.code).toBe('on_time')
    expect(nextBadge([badge('timekeeper', 0, 5), badge('goal_getter', 3, 3)])).toBeNull()
    expect([badgePct(badge('on_time', 4, 5, false)), badgePct(badge('goal_getter', 3, 3)), badgePct(badge('x', 9, 0, false))]).toEqual([80, 100, 0])
    // The server's order is kept among equals, and the list it was given is left alone.
    expect(sortBadges(BADGES).slice(0, 2).map(b => b.code)).toEqual(['goal_getter', 'streak_3'])
    expect(BADGES[0].code).toBe('priority_hero')
  })
})

describe('the ranking', () => {
  it('stands the first three on the podium with the winner in the middle, once two people have points', () => {
    const three = [row('a', 90, 1), row('b', 70, 2), row('c', 40, 3), row('d', 10, 4)]
    expect(podiumOf(three).map(s => [s.row.person, s.step])).toEqual([['b', 2], ['a', 1], ['c', 3]])
    expect(podiumOf(three.slice(0, 2)).map(s => [s.row.person, s.step])).toEqual([['b', 2], ['a', 1]])
    // Equal points share a step.
    expect(podiumOf([row('a', 90, 1), row('b', 90, 1), row('c', 40, 2)]).map(s => s.step)).toEqual([1, 1, 2])
    // One person with points, people with work but no points, or nobody placed: no podium.
    expect(podiumOf([row('a', 90, 1)])).toEqual([])
    expect(podiumOf([row('a', 90, 1), row('b', 0, 2)])).toEqual([])
    expect(podiumOf([row('a', 90, null)])).toEqual([])
  })

  it('sizes a row against the leader', () => {
    const rows = [row('a', 80, 1), row('b', 20, 2), row('c', 0, 3)]
    expect(rows.map(r => shareOf(r.points, rows))).toEqual([100, 25, 0])
    expect(shareOf(0, [row('a', 0, 1)])).toBe(0)
  })

  it('shows the table, only the person’s own figures, or that there is nothing yet', () => {
    expect(rankingView(seen(me(), { ranking: [row('u3', 120, 1, { me: true })] }))).toBe('table')
    expect(rankingView(seen(me()))).toBe('empty')
    expect(rankingView(seen(me(), { mode: 'own', ranking: [row('u3', 120, null, { me: true })] }))).toBe('private')
    // A manager sees the table whatever the organisation chose.
    expect(rankingView(seen(me(), { mode: 'own', manager: true, ranking: [row('u3', 120, 1, { me: true })] }))).toBe('table')
  })
})

describe('how points are earned', () => {
  it('lists the server’s figures, for a task and for a day, and nothing it did not send', () => {
    const rows = ruleRows(seen(me()).rules)
    expect(rows.map(r => r.code)).toEqual([...RULE_CODES])
    expect(rows.filter(r => r.kind === 'day').map(r => [r.code, r.points])).toEqual([['daily_goal', 20], ['clean_sweep', 25], ['day_planned', 10]])
    expect(rows.find(r => r.code === 'important')?.points).toBe(8)
    expect(ruleRows(undefined)).toEqual([])
    expect(ruleRows({ points: { task: 5 }, daily_goal: 3, planned_share: 60, day_task_cap: 15 }).map(r => r.code)).toEqual(['task'])
  })
})

describe('what is worth celebrating between two answers', () => {
  const before = seen(me())
  const after = (extra: Partial<RecognitionMe>, today: Partial<RecognitionMe['today']> = {}, week: Partial<RecognitionMe['week']> = {}, rest: Partial<Recognition> = {}) =>
    seen(me(extra, today, { points: 140, ...week }), rest)

  it('celebrates nothing on the first answer, on another day, for another person, or when no points were gained', () => {
    expect(cheersBetween(undefined, before)).toBeNull()
    expect(cheersBetween(before, undefined)).toBeNull()
    expect(cheersBetween(seen(null), before)).toBeNull()
    expect(cheersBetween(before, after({}, {}, {}, { today: '2026-11-05' }))).toBeNull()
    expect(cheersBetween(before, after({ person: 'u9' }))).toBeNull()
    expect(cheersBetween(before, seen(me()))).toBeNull()
    // A task set back to not done takes its points away: nothing to cheer, whatever else the answer says.
    expect(cheersBetween(before, after({}, { goal_met: true }, { points: 100 }))).toBeNull()
  })

  it('celebrates nothing when the rules changed in between (a manager’s new goal, another choice of who sees what)', () => {
    expect(cheersBetween(before, after({}, { goal_met: true }, {}, { rules: { ...before.rules!, daily_goal: 2 } }))).toBeNull()
    expect(cheersBetween(before, after({}, {}, {}, { mode: 'podium' }))).toBeNull()
  })

  it('shows only the points for a plain finished task', () => {
    expect(cheersBetween(before, after({}, { done: 3, points: 44 }))).toEqual({ main: null, also: [], points: 20, streak: 2, of: 4, done: 3 })
  })

  it('names the daily goal, a clean sweep, a well-planned day and an important task, the best one winning', () => {
    expect(cheersBetween(before, after({}, { important_done: 1 }))?.main).toEqual({ kind: 'important', big: false })
    expect(cheersBetween(before, after({}, { day_planned: true }))?.main).toEqual({ kind: 'planned', big: false })
    expect(cheersBetween(before, after({ streak: 3 }, { goal_met: true, important_done: 1 })))
      .toEqual({ main: { kind: 'goal', big: true }, also: ['important'], points: 20, streak: 3, of: 4, done: 2 })
    // The goal and the clean sweep on the same task: the sweep is the card, the goal is named on it.
    const both = cheersBetween(before, after({}, { goal_met: true, sweep: true }))
    expect(both?.main).toEqual({ kind: 'sweep', big: true })
    expect(both?.also).toEqual(['goal'])
  })

  it('names taking the lead only for someone who was not leading and is not alone', () => {
    expect(cheersBetween(before, after({}, { goal_met: true }, { rank: 1 }))?.main).toEqual({ kind: 'lead', big: true })
    expect(cheersBetween(seen(me({}, {}, { rank: 1 })), after({}, {}, { rank: 1 }))?.main).toBeNull()
    expect(cheersBetween(seen(me({}, {}, { rank: 1, of: 1 })), after({}, {}, { rank: 1, of: 1 }))?.main).toBeNull()
    expect(cheersBetween(seen(me({}, {}, { rank: null, of: 1 })), after({}, {}, { rank: 1, of: 1 }))?.main).toBeNull()
    // Someone who is told no place (the organisation shows only one's own points) never leads.
    expect(cheersBetween(seen(me({}, {}, { rank: null, of: null })), after({}, {}, { rank: null, of: null }))?.main).toBeNull()
  })

  it('names a new badge before everything else, the one worth the most when several arrive', () => {
    const earned = (codes: string[]) => BADGES.map(b => (codes.includes(b.code) ? { ...b, earned: true, have: b.need } : b))
    const best = cheersBetween(before, after({ badges: earned(['goal_getter']) }, { goal_met: true }, { rank: 1 }))
    expect(best?.main).toEqual({ kind: 'badge', badge: 'goal_getter', big: true })
    // Taking the lead and reaching the goal came with it: both are named on the card, the lead first.
    expect(best?.also).toEqual(['lead', 'goal'])
    expect(cheersBetween(before, after({ badges: earned(['timekeeper', 'clean_sweep', 'streak_3']) }, { sweep: true }))?.main)
      .toEqual({ kind: 'badge', badge: 'streak_3', more: 2, big: true })
    // A badge the bundles do not know yet still counts, after the ones they do.
    expect(cheersBetween(before, after({ badges: [...earned(['timekeeper']), badge('team_player', 1, 1)] }))?.main).toEqual({ kind: 'badge', badge: 'timekeeper', more: 1, big: true })
    // A badge already held is not new.
    const held = seen(me({ badges: earned(['goal_getter']) }))
    expect(cheersBetween(held, after({ badges: earned(['goal_getter']) }))?.main).toBeNull()
  })
})

describe('confetti', () => {
  it('is the same every time, spread over the width, in five colours', () => {
    const pieces = confettiPieces()
    expect(pieces).toHaveLength(44)
    expect(confettiPieces()).toEqual(pieces)
    expect(confettiPieces(10, 3)).not.toEqual(pieces.slice(0, 10))
    expect(pieces.every(p => p.left >= 0 && p.left <= 100 && p.delay >= 0 && p.delay <= 700 && p.time >= 2200 && p.time <= 3600)).toBe(true)
    expect(pieces.every(p => p.width >= 6 && p.width <= 10 && p.height >= 10 && p.height <= 18 && Math.abs(p.drift) <= 120 && Math.abs(p.turn) >= 360)).toBe(true)
    expect(new Set(pieces.map(p => p.tone)).size).toBe(5)
    // Not all in one corner: both halves of the screen get their share.
    expect(pieces.filter(p => p.left < 50).length).toBeGreaterThan(10)
    expect(pieces.filter(p => p.left >= 50).length).toBeGreaterThan(10)
    expect(confettiLength(pieces)).toBeLessThanOrEqual(4300)
    expect(confettiLength(pieces)).toBeGreaterThan(2200)
    expect(confettiPieces(0)).toEqual([])
  })
})

describe('the Achievements area', () => {
  it('sits under My day, off the phone’s full top bar, and goes when recognition is switched off', () => {
    expect(AREAS.map(a => a.key).slice(0, 2)).toEqual(['today', 'wins'])
    expect(AREAS.find(a => a.key === 'wins')).toMatchObject({ to: '/time/wins', phone: false })
    expect(areaOf('/time/wins')).toBe('wins')
    const boot = (recognition?: 'ranking' | 'own' | 'off') => ({ settings: recognition ? { recognition } : {} })
    expect(areasFor(undefined).some(a => a.key === 'wins')).toBe(true)
    expect(areasFor(boot()).some(a => a.key === 'wins')).toBe(true)
    expect(areasFor(boot('own')).some(a => a.key === 'wins')).toBe(true)
    expect(areasFor(boot('off')).map(a => a.key)).toEqual(AREAS.map(a => a.key).filter(k => k !== 'wins'))
    // The phone's top bar keeps its five areas.
    expect(areasFor(boot()).filter(a => a.phone).map(a => a.key)).toEqual(['today', 'plan', 'backlog', 'assistant', 'insights'])
  })
})

describe('the default words are the English bundle’s', () => {
  it('for every badge, celebration, rule and choice', () => {
    for (const code of BADGE_CODES) {
      expect(BADGE_WORDS[code].title).toBe((en.badge as Record<string, string>)[code])
      expect(BADGE_WORDS[code].hint).toBe((en.badge_hint as Record<string, string>)[code])
    }
    for (const kind of CHEER_KINDS) {
      expect(CHEER_WORDS[kind].title).toBe((en.cheer as Record<string, string>)[kind])
      expect(CHEER_WORDS[kind].line).toBe((en.cheer_line as Record<string, string>)[kind])
    }
    for (const code of RULE_CODES) expect(RULE_WORDS[code]).toBe((en.rule as Record<string, string>)[code])
    for (const mode of MODES) {
      expect(MODE_WORDS[mode].title).toBe((settingsEn.recognition.mode as Record<string, string>)[mode])
      expect(MODE_WORDS[mode].line).toBe((settingsEn.recognition.mode_line as Record<string, string>)[mode])
    }
  })
})
