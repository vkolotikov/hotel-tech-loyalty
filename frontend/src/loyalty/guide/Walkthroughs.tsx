import { Link } from 'react-router-dom'
import { ChevronDown, ArrowRight, BookOpen } from 'lucide-react'
import type { Can } from '../lib/types'
import type { Say } from './guideMath'
import { walkWords, matchingWalks } from './walkMath'
import { WALK_WORDS } from './words'

export function Walkthroughs({ query, say, can }: { query: string; say: Say; can: Can }) {
  const walks = matchingWalks(query, say)
  if (!walks.length) return null
  return <section aria-labelledby="guide-walks" className="space-y-3">
    <h2 id="guide-walks" className="flex items-center gap-2 font-a-display text-2xl text-a-text"><BookOpen size={20} aria-hidden />{say('loyalty.guide.walk.title', WALK_WORDS.title)}</h2>
    <p className="text-sm text-a-text-2">{say('loyalty.guide.walk.line', WALK_WORDS.line)}</p>
    <div className="grid items-start gap-3 lg:grid-cols-2">{walks.map(w => { const words = walkWords(w.id, say); return <details key={`${w.id}-${query.trim() !== ''}`} open={query.trim() !== '' || undefined} className="l-guide-walk group rounded-2xl border border-a-border bg-a-surface" data-guide-walk={w.id}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold text-a-text [&::-webkit-details-marker]:hidden">{words.title}<ChevronDown size={18} className="shrink-0 group-open:rotate-180" aria-hidden /></summary>
      <div className="space-y-4 px-4 pb-4"><ol className="l-guide-instructions">{words.steps.map((step, i) => <li key={step}><span aria-hidden>{i + 1}</span><p>{step}</p></li>)}</ol><p className="rounded-xl bg-a-surface-2 p-3 text-sm text-a-text-2">{words.note}</p>{can[w.needs] && <Link to={w.to} className="inline-flex items-center gap-2 text-sm font-semibold text-a-accent-text">{say('loyalty.guide.page.open', 'Open')}<ArrowRight size={16} aria-hidden /></Link>}</div>
    </details> })}</div>
  </section>
}
