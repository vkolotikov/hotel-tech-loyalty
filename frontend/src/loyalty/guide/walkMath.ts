import { fold, type Say } from './guideMath'
import { WALK_WORDS } from './words'

export const WALKS = [
  { id: 'offer', to: '/loyalty/rewards?tab=offers', needs: 'manage_rewards' },
  { id: 'event', to: '/loyalty/events', needs: 'manage_rewards' },
  { id: 'program', to: '/loyalty/program', needs: 'manage_program' },
  { id: 'portal', to: '/loyalty/app', needs: 'manage_app' },
] as const
export function walkWords(id: typeof WALKS[number]['id'], say: Say) {
  const word = (key: keyof typeof WALK_WORDS) => say(`loyalty.guide.walk.${key}`, WALK_WORDS[key])
  return { title: word(id), steps: ([1, 2, 3] as const).map(n => word(`${id}_${n}`)), note: word(`${id}_note`) }
}
export function matchingWalks(query: string, say: Say) {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  return WALKS.filter(w => { const text = walkWords(w.id, say); const all = fold([text.title, ...text.steps, text.note].join(' ')); return terms.every(term => all.includes(term)) })
}
