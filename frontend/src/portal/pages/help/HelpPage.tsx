import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight, Bell, CalendarDays, ChevronDown, Gift, LayoutGrid, Mail, MessageCircle, Phone, QrCode, Search,
  SearchX, Sparkles, Ticket, User, type LucideIcon,
} from 'lucide-react'
import { usePortal } from '../../PortalProvider'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { INPUT_CLASS } from '../../ui/Field'
import {
  STEPS, narrow, questionWords, questionsFor, showsSteps, stepWords, topicWord, topicsFor,
  type QuestionId, type Say, type StepId, type TopicId,
} from './helpMath'

const STEP_ICONS: Record<StepId, LucideIcon> = { card: QrCode, earn: Sparkles, spend: Gift }
const TOPIC_ICONS: Record<TopicId | 'all', LucideIcon> = { all: LayoutGrid, card: QrCode, rewards: Gift, bookings: CalendarDays, events: Ticket, account: User }
// Tailwind sees only literal class names: the steps rise one after another (`--p-delay`, portal.css).
const STEP_DELAYS = ['', '[--p-delay:90ms]', '[--p-delay:180ms]'] as const

/**
 * Help (owner 2026-10-26: "add the member FAQ to the portal too"): a search; for a loyalty member, how it works in
 * three steps; the questions by topic, one or two sentences each, only about what this member's portal has
 * (`questionsFor()`); and the venue's own email and phone. Opened from the header's question mark and from Profile.
 * Reads nothing beyond the bootstrap.
 */
export function HelpPage() {
  const { t } = useTranslation()
  const { data } = usePortal()
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState<TopicId | 'all'>('all')
  if (!data) return null

  const say: Say = (key, fallback) => t(key, fallback)
  const questions = questionsFor(data)
  const topics = topicsFor(questions)
  const found = narrow(query, topic, questions, say)
  const searching = query.trim() !== ''
  const { email, phone } = data.venue.contact
  const loyalty = showsSteps(data)

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden p-5 sm:p-6 bg-gradient-to-br from-p-accent/15 via-p-surface to-p-surface">
        <Drifting icons={loyalty ? [QrCode, Sparkles, Gift] : [CalendarDays, Bell, User]} />
        <div className="relative max-w-md space-y-3">
          <h1 className="font-p-display text-3xl">{t('portal.help.title', 'Help')}</h1>
          <p className="text-sm text-p-text-2">{t('portal.help.line', 'Short answers about your membership.')}</p>
          <label className="relative block">
            <span className="sr-only">{t('portal.help.search', 'Search questions')}</span>
            <Search size={17} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-p-text-2" />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('portal.help.search', 'Search questions')}
              className={`${INPUT_CLASS} pl-10`} />
          </label>
        </div>
      </Card>

      {loyalty && !searching && (
        <section aria-labelledby="help-how" className="space-y-3">
          <h2 id="help-how" className="text-sm font-semibold">{t('portal.help.how', 'How it works')}</h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = STEP_ICONS[s.id]
              const w = stepWords(s.id, say)
              return (
                <li key={s.id} className={`p-rise ${STEP_DELAYS[i]}`}>
                  <Link to={s.to} data-help-step={s.id} className="block h-full">
                    <Card className="p-4 p-lift h-full flex items-center gap-3 sm:flex-col sm:items-start">
                      <span className="relative w-11 h-11 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0">
                        <Icon size={20} aria-hidden />
                        <span aria-hidden className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-p-accent text-p-accent-ink text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{w.title}</span>
                        <span className="block text-xs text-p-text-2">{w.line}</span>
                      </span>
                    </Card>
                  </Link>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <section aria-labelledby="help-questions" className="space-y-3">
        <h2 id="help-questions" className="text-sm font-semibold">{t('portal.help.questions', 'Questions')}</h2>
        {topics.length > 1 && (
          <div role="group" aria-label={t('portal.help.questions', 'Questions')} className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {(['all', ...topics] as const).map(id => {
              const Icon = TOPIC_ICONS[id]
              const on = topic === id
              return (
                <button key={id} type="button" aria-pressed={on} onClick={() => setTopic(id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 min-h-10 text-sm font-medium transition-colors ${on
                    ? 'border-transparent bg-p-accent text-p-accent-ink'
                    : 'border-p-border bg-p-surface text-p-text-2 hover:text-p-text'}`}>
                  <Icon size={15} aria-hidden />{id === 'all' ? t('portal.help.all', 'All') : topicWord(id, say)}
                </button>
              )
            })}
          </div>
        )}
        {found.length > 0 ? (
          <ul className="space-y-2">
            {found.map(id => {
              const q = questions.find(x => x.id === id)!
              return <Question key={`${id}-${searching}`} id={id} icon={TOPIC_ICONS[q.topic]} to={q.to} open={searching} say={say} />
            })}
          </ul>
        ) : (
          <EmptyState icon={<SearchX size={18} aria-hidden />} title={t('portal.help.nothing', 'No answer found. Try other words.')} />
        )}
      </section>

      {(email || phone) && (
        <Card className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="w-11 h-11 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0"><MessageCircle size={20} aria-hidden /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t('portal.help.contact', 'Still need help?')}</p>
              <p className="text-xs text-p-text-2">{t('portal.help.contact_line', '{{venue}} is happy to help.', { venue: data.venue.name })}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {email && (
              <a href={`mailto:${email}`} className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 min-h-11 px-4 rounded-p-control bg-p-accent text-p-accent-ink text-sm font-semibold p-lift">
                <Mail size={16} aria-hidden />{t('portal.help.email', 'Email')}
              </a>
            )}
            {phone && (
              <a href={`tel:${phone}`} className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 min-h-11 px-4 rounded-p-control border border-p-border bg-p-surface text-p-text text-sm font-semibold p-lift">
                <Phone size={16} aria-hidden />{t('portal.help.call', 'Call')}
              </a>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

/** One question: the answer folds out under it, with the way to where it is done. Open while searching. */
function Question({ id, icon: Icon, to, open, say }: { id: QuestionId; icon: LucideIcon; to?: string; open: boolean; say: Say }) {
  const { t } = useTranslation()
  const w = questionWords(id, say)
  return (
    <li>
      <details open={open || undefined} data-help-question={id} className="group rounded-p-card border border-p-border bg-p-surface shadow-p transition-colors open:border-p-accent/40">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="w-8 h-8 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0"><Icon size={15} /></span>
          <span className="min-w-0 flex-1">{w.q}</span>
          <ChevronDown size={18} aria-hidden className="shrink-0 text-p-text-2 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 pl-[3.75rem] space-y-1 text-sm text-p-text-2 p-unfold">
          <p>{w.a}</p>
          {to && (
            <Link to={to} className="p-tap inline-flex items-center gap-1 font-semibold text-p-accent-deep">
              {t('portal.help.open', 'Open')}<ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </div>
      </details>
    </li>
  )
}

/** The hero's drifting icons, from a tablet up (on a phone they would sit on the search). */
function Drifting({ icons }: { icons: readonly LucideIcon[] }) {
  const spots = ['right-6 top-6', 'right-24 top-16 [--p-delay:-2s]', 'right-10 bottom-6 [--p-delay:-4s]']
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
      {icons.map((Icon, i) => (
        <span key={spots[i]} className={`absolute ${spots[i]} p-bob w-12 h-12 rounded-2xl border border-p-border bg-p-surface/80 text-p-accent-deep shadow-p flex items-center justify-center`}>
          <Icon size={22} />
        </span>
      ))}
    </div>
  )
}
