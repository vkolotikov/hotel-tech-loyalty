import type { RecognitionMode } from '../lib/types'
import type { BuddyKind, Mood } from './buddyLogic'
import type { BadgeCode, CheerKind, RuleCode } from './winsLogic'

/**
 * Recognition's default (English) words for the keys its codes pick: time.wins.badge.<code>, badge_hint.<code>,
 * cheer.<kind>, cheer_line.<kind>, rule.<code>, buddy.name.<kind>, buddy.say.<mood> and
 * time.settings.recognition.mode.<mode>, mode_line.<mode>. The five
 * bundles hold the same keys (timeLocales.test.ts); these are what a missing bundle would fall back to.
 */

export const BADGE_WORDS: Record<BadgeCode, { title: string; hint: string }> = {
  priority_hero: { title: 'Priority hero', hint: 'Finish {{need}} high-priority tasks in a week' },
  goal_getter: { title: 'Goal getter', hint: 'Reach the daily goal on {{need}} days of a week' },
  clean_sweep: { title: 'Clean sweep', hint: 'Finish everything you planned for a day' },
  well_planned: { title: 'Well planned', hint: 'Plan at least {{share}} % of your working time on {{need}} days of a week' },
  on_time: { title: 'Right on time', hint: 'Finish {{need}} or more tasks in a week, {{share}} % of them on their day or earlier' },
  timekeeper: { title: 'Timekeeper', hint: 'Time {{need}} tasks with Start and Finish in a week' },
  streak_3: { title: 'On a roll', hint: 'Reach the daily goal {{need}} days in a row' },
  streak_7: { title: 'Unstoppable', hint: 'Reach the daily goal {{need}} days in a row' },
  podium: { title: 'On the podium', hint: 'Finish a week among the top three' },
  champion: { title: 'Champion of the week', hint: 'Finish a week in first place' },
}

export const CHEER_WORDS: Record<CheerKind, { title: string; line: string }> = {
  badge: { title: 'New badge: {{badge}}', line: 'You earned it this week. It is yours on the Achievements page.' },
  lead: { title: 'You lead the week!', line: 'First place of {{of}}. Keep it up.' },
  sweep: { title: 'Clean sweep!', line: 'Everything you planned for today is done.' },
  goal: { title: 'Daily goal reached!', line: 'Everything you finish after it still earns points.' },
  planned: { title: 'Your day is well planned', line: 'A filled calendar earns a bonus. Now make it happen.' },
  important: { title: 'Important task done', line: 'High-priority work earns extra points.' },
}

export const RULE_WORDS: Record<RuleCode, string> = {
  task: 'Every finished task',
  quarter_hour: 'For each planned quarter of an hour of the task, up to {{cap}} points',
  important: 'A high-priority task',
  on_time: 'Finished on its day or earlier',
  clocked: 'Timed with Start and Finish',
  daily_goal: 'The daily goal reached ({{goal}} finished in a day)',
  clean_sweep: 'A clean sweep: everything planned for the day finished',
  day_planned: 'A filled calendar: at least {{share}} % of your working time planned',
}

export const MODE_WORDS: Record<RecognitionMode, { title: string; line: string }> = {
  ranking: { title: 'Everyone sees the ranking', line: 'The whole team sees the week’s table: every place, the points and the podium.' },
  podium: { title: 'The top three and one’s own place', line: 'Everyone sees the podium and where they stand themselves; the other places stay private.' },
  own: { title: 'Only one’s own points', line: 'Everyone sees their own points, goal, streak and badges; nobody is compared. Managers still see the table.' },
  off: { title: 'Switched off', line: 'No points, badges, ranking or celebrations for anyone.' },
}

/** The characters' names: proper names, the same in every language. */
export const BUDDY_NAMES: Record<BuddyKind, string> = { hexi: 'Hexi', pip: 'Pip', miu: 'Miu', ember: 'Ember' }

/** What a character calls out in each mood, before the sentence about the day. */
export const BUDDY_SAYS: Record<Mood, string> = {
  sleepy: 'Zzz…',
  ready: 'Let’s go!',
  busy: 'Nice!',
  proud: 'Yes!',
  party: 'Woohoo!',
}
