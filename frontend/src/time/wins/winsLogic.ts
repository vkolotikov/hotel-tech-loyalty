import type { Badge, RankRow, Recognition, RecognitionDay, RecognitionMe, RecognitionMode } from '../lib/types'

/**
 * Recognition's decisions (2026-11-28), pure because the page tests render to a string. Every figure here is the
 * server's (App\Services\Time\Recognition: points, the daily goal, the streak, badges, places); these only say what a
 * screen shows of them and what is worth celebrating between two answers.
 */

/* ─── Who sees the ranking ───────────────────────────────────────── */

export const MODES = ['ranking', 'podium', 'own', 'off'] as const

/**
 * The organisation's choice; where none was made (or an answer names none) it is the server's default, the top three
 * and one's own place (Recognition::DEFAULT_MODE).
 */
export function modeOf(value: unknown): RecognitionMode {
  return (MODES as readonly unknown[]).includes(value) ? (value as RecognitionMode) : 'podium'
}

/** The daily goal as the settings form holds it: a whole number from 1 to 20, or null for what cannot be saved. */
export const GOAL_MIN = 1
export const GOAL_MAX = 20

export function goalValue(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null
  const n = Number(text.trim())
  return n >= GOAL_MIN && n <= GOAL_MAX ? n : null
}

/* ─── Today ──────────────────────────────────────────────────────── */

type TodayState = RecognitionMe['today']

/** How far the daily goal is, in per cent; full once the server says it is met (a day of few long tasks). */
export function goalPct(today: TodayState): number {
  if (today.goal_met) return 100
  if (today.goal <= 0) return 0
  return Math.min(99, Math.max(0, Math.round((today.done / today.goal) * 100)))
}

/** What earns the next points today: plan the day, reach the goal, finish the rest, or nothing more. */
export type NextStep = { code: 'plan' } | { code: 'goal'; left: number } | { code: 'sweep'; left: number } | { code: 'done' }

export function nextStep(today: TodayState): NextStep {
  if (today.planned === 0) return { code: 'plan' }
  if (!today.goal_met) return { code: 'goal', left: Math.max(1, today.goal - today.done) }
  if (!today.sweep && today.planned > today.done) return { code: 'sweep', left: today.planned - today.done }
  return { code: 'done' }
}

/* ─── The week ───────────────────────────────────────────────────── */

/** A day of the week strip: still to come, without tasks, with tasks, the goal met, or everything done. */
export type DotState = 'future' | 'empty' | 'open' | 'goal' | 'sweep'

export function dotOf(day: RecognitionDay): DotState {
  if (day.future) return 'future'
  if (day.sweep) return 'sweep'
  if (day.goal_met) return 'goal'
  return day.planned > 0 ? 'open' : 'empty'
}

/** Each day's bar in per cent of the week's best day (0 for a day without points; at least a sliver for one with). */
export function dayHeights(days: readonly RecognitionDay[]): number[] {
  const top = Math.max(0, ...days.map(d => d.points))
  return days.map(d => (top > 0 && d.points > 0 ? Math.max(8, Math.round((d.points / top) * 100)) : 0))
}

/* ─── Badges ─────────────────────────────────────────────────────── */

/** The badges the bundles have words for (a newer server's code is shown by its own name). */
export const BADGE_CODES = ['priority_hero', 'goal_getter', 'clean_sweep', 'well_planned', 'on_time', 'timekeeper', 'streak_3', 'streak_7', 'podium', 'champion'] as const
export type BadgeCode = (typeof BADGE_CODES)[number]

export function isBadgeCode(code: string): code is BadgeCode {
  return (BADGE_CODES as readonly string[]).includes(code)
}

const share = (b: Badge) => (b.need > 0 ? Math.min(1, b.have / b.need) : 0)

/** Earned first, then the ones still to earn with the nearest first; otherwise the server's order. */
export function sortBadges(badges: readonly Badge[]): Badge[] {
  return badges.map((b, i) => ({ b, i }))
    .sort((x, y) => Number(y.b.earned) - Number(x.b.earned) || share(y.b) - share(x.b) || x.i - y.i)
    .map(x => x.b)
}

export function earnedCount(badges: readonly Badge[]): number {
  return badges.filter(b => b.earned).length
}

/** The badge nearest to being earned that something already counts towards; none when nothing is under way. */
export function nextBadge(badges: readonly Badge[]): Badge | null {
  return sortBadges(badges).find(b => !b.earned && b.have > 0) ?? null
}

/** A badge's progress in per cent. */
export function badgePct(badge: Badge): number {
  return badge.earned ? 100 : Math.round(share(badge) * 100)
}

/* ─── The ranking ────────────────────────────────────────────────── */

export interface PodiumSpot { row: RankRow; step: 1 | 2 | 3 }

/**
 * The podium: the first three places with points, the winner in the middle (second, first, third). Equal points share
 * a step. No podium until two people have points — one person alone on it says nothing.
 */
export function podiumOf(ranking: readonly RankRow[]): PodiumSpot[] {
  const placed = ranking.filter(r => r.rank !== null && r.rank <= 3 && r.points > 0).slice(0, 3)
  if (placed.length < 2) return []
  const spots = placed.map(row => ({ row, step: row.rank as 1 | 2 | 3 }))
  return spots.length === 3 ? [spots[1], spots[0], spots[2]] : [spots[1], spots[0]]
}

/** A row's bar: its points in per cent of the leader's. */
export function shareOf(points: number, ranking: readonly RankRow[]): number {
  const top = Math.max(0, ...ranking.map(r => r.points))
  return top > 0 ? Math.max(0, Math.min(100, Math.round((points / top) * 100))) : 0
}

/** What the page shows of the ranking: the table, only the person's own figures, or nothing to show yet. */
export type RankingView = 'table' | 'private' | 'empty'

export function rankingView(data: Recognition): RankingView {
  const rows = data.ranking ?? []
  if (data.mode === 'own' && !data.manager) return 'private'
  return rows.length === 0 ? 'empty' : 'table'
}

/* ─── How points are earned ──────────────────────────────────────── */

export const RULE_CODES = ['task', 'quarter_hour', 'important', 'on_time', 'clocked', 'daily_goal', 'clean_sweep', 'day_planned'] as const
export type RuleCode = (typeof RULE_CODES)[number]

const DAY_RULES: readonly RuleCode[] = ['daily_goal', 'clean_sweep', 'day_planned']

export interface RuleRow { code: RuleCode; points: number; kind: 'task' | 'day' }

/** The ways to earn, in the order the page lists them, each with the server's own figure. */
export function ruleRows(rules: Recognition['rules']): RuleRow[] {
  if (!rules) return []
  return RULE_CODES.filter(code => typeof rules.points[code] === 'number')
    .map(code => ({ code, points: rules.points[code], kind: DAY_RULES.includes(code) ? 'day' as const : 'task' as const }))
}

/* ─── What is worth celebrating ──────────────────────────────────── */

export const CHEER_KINDS = ['badge', 'lead', 'sweep', 'goal', 'planned', 'important'] as const
export type CheerKind = (typeof CHEER_KINDS)[number]

/** One moment to celebrate; `big` ones get confetti. */
export interface Cheer { kind: CheerKind; badge?: string; more?: number; big: boolean }

/**
 * What changed between two answers: the moment (if any), the other moments that came with it (best first, never a
 * badge: `more` counts those), the points gained, and what the card says with them.
 */
export interface Cheers { main: Cheer | null; also: CheerKind[]; points: number; streak: number; of: number | null; done: number }

/** When several badges arrive at once, the one worth the most is named. */
const BADGE_WEIGHT: readonly string[] = ['champion', 'podium', 'streak_7', 'streak_3', 'clean_sweep', 'goal_getter', 'priority_hero', 'well_planned', 'on_time', 'timekeeper']

const BIG: readonly CheerKind[] = ['badge', 'lead', 'sweep', 'goal']

/**
 * What a person earned between two answers of the server. Nothing unless the points went up on the same day, for the
 * same person, under the same rules (so the first answer of a session, a new day, a task un-done or a manager's change
 * of the goal celebrates nothing). The best moment wins the card: a new badge, taking the lead, a clean sweep, the
 * daily goal, a well-planned day, an important task; what else came with it is named on the card (`also`), and a plain
 * task only shows its points.
 */
export function cheersBetween(before: Recognition | undefined, after: Recognition | undefined): Cheers | null {
  const a = before?.me
  const b = after?.me
  if (!before || !after || !a || !b) return null
  if (before.today !== after.today || a.person !== b.person || before.mode !== after.mode) return null
  if ((before.rules?.daily_goal ?? null) !== (after.rules?.daily_goal ?? null)) return null
  const points = b.week.points - a.week.points
  if (points <= 0) return null

  const had = new Set(a.badges.filter(x => x.earned).map(x => x.code))
  const fresh = b.badges.filter(x => x.earned && !had.has(x.code)).map(x => x.code)
    .sort((x, y) => (BADGE_WEIGHT.indexOf(x) + 1 || 99) - (BADGE_WEIGHT.indexOf(y) + 1 || 99))
  const leads = b.week.rank === 1 && a.week.rank !== 1 && (b.week.of ?? 0) > 1

  // Everything that happened, best first; the first is the card, the rest are named on it.
  const moments: CheerKind[] = []
  if (fresh.length > 0) moments.push('badge')
  if (leads) moments.push('lead')
  if (b.today.sweep && !a.today.sweep) moments.push('sweep')
  if (b.today.goal_met && !a.today.goal_met) moments.push('goal')
  if (b.today.day_planned && !a.today.day_planned) moments.push('planned')
  if (b.today.important_done > a.today.important_done) moments.push('important')

  const kind = moments[0] ?? null
  const main: Cheer | null = kind === null ? null : {
    kind,
    big: BIG.includes(kind),
    ...(kind === 'badge' ? { badge: fresh[0], ...(fresh.length > 1 ? { more: fresh.length - 1 } : {}) } : {}),
  }
  return { main, also: moments.slice(1), points, streak: b.streak, of: b.week.of, done: b.today.done }
}
