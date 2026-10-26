import type { Can } from '../lib/types'
import { FAQ_WORDS, FEATURE_WORDS, STEP_WORDS, TOPIC_WORDS } from './words'

/**
 * The Guide's shape (owner 2026-10-26), pure so the tests read it by value: the quick start's steps, the feature cards
 * (each where it leads, and the right it needs — the same rights the menu lists those pages for), the questions by
 * topic, and the search that narrows the cards and the questions to the words typed.
 */

export type StepId = 'tiers' | 'earn' | 'places' | 'members' | 'scan'
export type FeatureId = 'scan' | 'door' | 'members' | 'tiers' | 'places' | 'events' | 'earn' | 'rewards' | 'requests' | 'campaigns' | 'insights' | 'app'
export type TopicId = keyof typeof TOPIC_WORDS
export type FaqId =
  | 'start' | 'roles' | 'look' | 'how_scan' | 'colours' | 'door' | 'expired' | 'nfc' | 'move_up' | 'by_hand' | 'end_date' | 'import'
  | 'run_event' | 'sign_up' | 'give_points' | 'redeem' | 'boosts' | 'portal_what' | 'portal_card'

export const STEPS: readonly { id: StepId; to: string }[] = [
  { id: 'tiers', to: '/loyalty/program' },
  { id: 'earn', to: '/loyalty/options' },
  { id: 'places', to: '/loyalty/program?tab=places' },
  { id: 'members', to: '/loyalty' },
  { id: 'scan', to: '/loyalty/scan' },
]

/** The cards, in the menu's order; Campaigns, Insights and Card & app only for whoever the menu lists them for. */
export const FEATURES: readonly { id: FeatureId; to: string; needs?: keyof Can }[] = [
  { id: 'scan', to: '/loyalty/scan' },
  { id: 'door', to: '/loyalty/scan' },
  { id: 'members', to: '/loyalty' },
  { id: 'tiers', to: '/loyalty/program' },
  { id: 'places', to: '/loyalty/program?tab=places' },
  { id: 'events', to: '/loyalty/events' },
  { id: 'earn', to: '/loyalty/options' },
  { id: 'rewards', to: '/loyalty/rewards' },
  { id: 'requests', to: '/loyalty/requests' },
  { id: 'campaigns', to: '/loyalty/campaigns', needs: 'manage_campaigns' },
  { id: 'insights', to: '/loyalty/insights', needs: 'view_insights' },
  { id: 'app', to: '/loyalty/app', needs: 'manage_app' },
]

export const TOPICS: readonly TopicId[] = ['start', 'scan', 'members', 'events', 'rewards', 'portal']

/** The questions, by topic; `to` where the answer can be done (none for one answered in words alone). */
export const FAQ: readonly { id: FaqId; topic: TopicId; to?: string }[] = [
  { id: 'start', topic: 'start' },
  { id: 'roles', topic: 'start' },
  { id: 'look', topic: 'start' },
  { id: 'how_scan', topic: 'scan', to: '/loyalty/scan' },
  { id: 'colours', topic: 'scan' },
  { id: 'door', topic: 'scan', to: '/loyalty/scan' },
  { id: 'expired', topic: 'scan' },
  { id: 'nfc', topic: 'scan' },
  { id: 'move_up', topic: 'members', to: '/loyalty/options' },
  { id: 'by_hand', topic: 'members', to: '/loyalty' },
  { id: 'end_date', topic: 'members', to: '/loyalty' },
  { id: 'import', topic: 'members', to: '/loyalty' },
  { id: 'run_event', topic: 'events', to: '/loyalty/events' },
  { id: 'sign_up', topic: 'events', to: '/loyalty/events' },
  { id: 'give_points', topic: 'rewards', to: '/loyalty/scan' },
  { id: 'redeem', topic: 'rewards', to: '/loyalty/requests' },
  { id: 'boosts', topic: 'rewards', to: '/loyalty/program?tab=boosts' },
  { id: 'portal_what', topic: 'portal' },
  { id: 'portal_card', topic: 'portal' },
]

/** The feature cards this person's menu has pages for. */
export function featuresFor(can: Can): typeof FEATURES[number][] {
  return FEATURES.filter(f => !f.needs || Boolean(can[f.needs]))
}

/** A word of the guide in the reader's language: its key under `loyalty.guide.` and its English. */
export type Say = (key: string, fallback: string) => string

export const stepWords = (id: StepId, say: Say) => ({
  title: say(`loyalty.guide.step.${id}`, STEP_WORDS[id]),
  line: say(`loyalty.guide.step.${id}_line`, STEP_WORDS[`${id}_line`]),
})
export const featureWords = (id: FeatureId, say: Say) => ({
  title: say(`loyalty.guide.feature.${id}`, FEATURE_WORDS[id]),
  line: say(`loyalty.guide.feature.${id}_line`, FEATURE_WORDS[`${id}_line`]),
})
export const faqWords = (id: FaqId, say: Say) => ({
  q: say(`loyalty.guide.faq.${id}_q`, FAQ_WORDS[`${id}_q`]),
  a: say(`loyalty.guide.faq.${id}_a`, FAQ_WORDS[`${id}_a`]),
})
export const topicWord = (id: TopicId, say: Say) => say(`loyalty.guide.topic.${id}`, TOPIC_WORDS[id])

/** Lower case, without accents: "Événements" finds "evenements", "ё" finds "е". */
export function fold(text: string): string {
  return text.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ё/g, 'е')
}

/**
 * What the search keeps: the cards and the questions holding every word typed (in their title, line, question or
 * answer, in the reader's language), and the topic chosen. An empty search keeps everything.
 */
export function narrow(query: string, topic: TopicId | 'all', features: readonly typeof FEATURES[number][], say: Say): { features: FeatureId[]; faq: FaqId[] } {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const holds = (...texts: string[]) => { const all = fold(texts.join(' ')); return words.every(w => all.includes(w)) }
  return {
    features: words.length === 0 ? features.map(f => f.id) : features.filter(f => { const w = featureWords(f.id, say); return holds(w.title, w.line) }).map(f => f.id),
    faq: FAQ.filter(f => (topic === 'all' || f.topic === topic) && (words.length === 0 || (() => { const w = faqWords(f.id, say); return holds(w.q, w.a, topicWord(f.topic, say)) })())).map(f => f.id),
  }
}
