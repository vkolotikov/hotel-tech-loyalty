import type { PortalBootstrap } from '../../lib/types'
import { HELP_WORDS } from './words'

/**
 * The Help page's shape, pure so the tests read it by value: the three steps of a loyalty programme, the questions by
 * topic — each only where the member's portal has what it talks about (no points questions at a venue without loyalty,
 * no booking questions where nothing can be booked, events only while the menu offers them) — and the search.
 */

export type TopicId = keyof typeof HELP_WORDS.topic
export type QuestionId = keyof typeof HELP_WORDS.q
export type StepId = 'card' | 'earn' | 'spend'

type Needs = (data: PortalBootstrap) => boolean
const loyalty: Needs = d => d.capabilities.loyalty && !!d.member
const booking: Needs = d => d.capabilities.services || d.capabilities.stays
const member: Needs = d => !!d.member

export const TOPICS: readonly TopicId[] = ['card', 'rewards', 'bookings', 'events', 'account']

/** The questions, by topic; `to` where the answer is done (none for one answered in words alone). */
export const QUESTIONS: readonly { id: QuestionId; topic: TopicId; to?: string; needs?: Needs }[] = [
  { id: 'card', topic: 'card', to: '/portal', needs: loyalty },
  { id: 'wallet', topic: 'card', to: '/portal', needs: loyalty },
  { id: 'earn', topic: 'card', to: '/portal/activity', needs: loyalty },
  { id: 'balance', topic: 'card', to: '/portal/activity', needs: loyalty },
  { id: 'level', topic: 'card', to: '/portal', needs: loyalty },
  // Only for a membership with an end date (release 8): the member can still sign in after it.
  { id: 'ends', topic: 'card', needs: d => !!d.member?.membership?.valid_until },
  { id: 'spend', topic: 'rewards', to: '/portal/rewards?tab=catalogue', needs: loyalty },
  { id: 'codes', topic: 'rewards', to: '/portal/rewards?tab=codes', needs: loyalty },
  { id: 'benefits', topic: 'rewards', to: '/portal/rewards?tab=benefits', needs: loyalty },
  { id: 'offers', topic: 'rewards', to: '/portal/rewards?tab=offers', needs: loyalty },
  { id: 'book', topic: 'bookings', to: '/portal/book', needs: booking },
  { id: 'cancel', topic: 'bookings', to: '/portal/bookings', needs: booking },
  { id: 'change', topic: 'bookings', to: '/portal/bookings', needs: booking },
  { id: 'sign_up', topic: 'events', to: '/portal/events', needs: d => !!d.capabilities.events },
  { id: 'door', topic: 'events', to: '/portal', needs: d => !!d.capabilities.events && !!d.member },
  { id: 'details', topic: 'account', to: '/portal/profile' },
  { id: 'messages', topic: 'account', to: '/portal/profile#messages', needs: member },
  { id: 'password', topic: 'account' },
  { id: 'install', topic: 'account' },
  { id: 'delete', topic: 'account', to: '/portal/profile' },
]

/** How a loyalty programme works, in three steps, each opening where it happens. */
export const STEPS: readonly { id: StepId; to: string }[] = [
  { id: 'card', to: '/portal' },
  { id: 'earn', to: '/portal/activity' },
  { id: 'spend', to: '/portal/rewards?tab=catalogue' },
]

/** The steps are a loyalty programme's: shown to a member of a venue that runs one. */
export const showsSteps = (data: PortalBootstrap): boolean => loyalty(data)

/** The questions this member's portal has answers for. */
export function questionsFor(data: PortalBootstrap): typeof QUESTIONS[number][] {
  return QUESTIONS.filter(q => !q.needs || q.needs(data))
}

/** The topics that hold at least one of those questions, in order. */
export function topicsFor(questions: readonly typeof QUESTIONS[number][]): TopicId[] {
  return TOPICS.filter(t => questions.some(q => q.topic === t))
}

/** A word of the page in the member's language: its key and its English. */
export type Say = (key: string, fallback: string) => string

export const stepWords = (id: StepId, say: Say) => ({
  title: say(`portal.help.step.${id}`, HELP_WORDS.step[id]),
  line: say(`portal.help.step.${id}_line`, HELP_WORDS.step[`${id}_line`]),
})
export const questionWords = (id: QuestionId, say: Say) => ({
  q: say(`portal.help.q.${id}`, HELP_WORDS.q[id]),
  a: say(`portal.help.a.${id}`, HELP_WORDS.a[id]),
})
export const topicWord = (id: TopicId, say: Say) => say(`portal.help.topic.${id}`, HELP_WORDS.topic[id])

/** Lower case, without accents: "réservation" finds "reservation", "ё" finds "е". */
export function fold(text: string): string {
  return text.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0451/g, '\u0435')
}

/**
 * The questions the search and the topic keep: every word typed in the question, its answer or its topic's name (in
 * the member's language), within the topic chosen. An empty search keeps the topic's questions.
 */
export function narrow(query: string, topic: TopicId | 'all', questions: readonly typeof QUESTIONS[number][], say: Say): QuestionId[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return questions
    .filter(q => topic === 'all' || q.topic === topic)
    .filter(q => {
      if (words.length === 0) return true
      const w = questionWords(q.id, say)
      const all = fold(`${w.q} ${w.a} ${topicWord(q.topic, say)}`)
      return words.every(word => all.includes(word))
    })
    .map(q => q.id)
}
