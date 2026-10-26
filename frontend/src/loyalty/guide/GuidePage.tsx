import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight, BarChart3, BookOpen, CalendarDays, ChevronDown, CircleHelp, Crown, CreditCard, DoorOpen, Gift, Inbox, LayoutGrid, Mail, Maximize2,
  Rocket, ScanLine, Search, SearchX, Smartphone, Sparkles, Star, UserPlus, Users, type LucideIcon,
} from 'lucide-react'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { useBoot } from '../LoyaltyProvider'
import { ScanDemo } from './ScanDemo'
import {
  FAQ, STEPS, TOPICS, faqWords, featureWords, featuresFor, narrow, stepWords, topicWord,
  type FaqId, type FeatureId, type Say, type StepId, type TopicId,
} from './guideMath'

const STEP_ICONS: Record<StepId, LucideIcon> = { tiers: Crown, earn: Sparkles, places: DoorOpen, members: UserPlus, scan: ScanLine }
const FEATURE_ICONS: Record<FeatureId, LucideIcon> = {
  scan: ScanLine, door: Maximize2, members: Users, tiers: Crown, places: DoorOpen, events: CalendarDays, earn: Sparkles,
  rewards: Gift, requests: Inbox, campaigns: Mail, insights: BarChart3, app: CreditCard,
}
const TOPIC_ICONS: Record<TopicId | 'all', LucideIcon> = {
  all: LayoutGrid, start: Rocket, scan: ScanLine, members: Users, events: CalendarDays, rewards: Star, portal: Smartphone,
}

/**
 * The Guide (owner 2026-10-26: "documentation … modern and easy to understand … short … like frequently asked questions
 * … some animation, interaction"): a search across everything; the quick start in five steps; what the workspace does,
 * as cards that open each page (only the pages this person's menu has); "Try a scan", the door's answers acted out with
 * the venue's own tiers; and the questions by topic, one or two sentences each. Reads nothing from the server beyond
 * the bootstrap; every word in five languages (guide.<lang>.json).
 */
export function GuidePage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const say: Say = (key, fallback) => t(key, fallback)
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState<TopicId | 'all'>('all')
  const features = featuresFor(boot.staff.can)
  const found = narrow(query, topic, features, say)
  const searching = query.trim() !== ''
  const nothing = searching && found.features.length === 0 && found.faq.length === 0

  return (
    <div className="space-y-8 px-4 py-6 lg:px-6">
      <header className="relative overflow-hidden rounded-3xl border border-a-border bg-gradient-to-br from-a-accent/15 via-a-surface to-a-surface p-6 sm:p-8">
        <Floating />
        <div className="relative max-w-2xl space-y-4">
          <PageHeader title={t('loyalty.guide.page.title', 'Guide')} />
          <p className="text-base text-a-text-2">{t('loyalty.guide.page.line', 'Everything the workspace does, in short answers.')}</p>
          <label className="relative block">
            <span className="sr-only">{t('loyalty.guide.page.search', 'Search the guide')}</span>
            <Search size={18} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-a-text-2" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('loyalty.guide.page.search', 'Search the guide')}
              className="w-full rounded-2xl border border-a-border bg-a-surface py-3.5 pl-11 pr-4 text-base text-a-text shadow-a-sm" />
          </label>
        </div>
      </header>

      {!searching && <QuickStart say={say} />}

      {found.features.length > 0 && (
        <section aria-labelledby="guide-features" className="space-y-3">
          <SectionTitle id="guide-features" icon={BookOpen}>{t('loyalty.guide.page.features', 'What you can do')}</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {features.filter(f => found.features.includes(f.id)).map(f => {
              const Icon = FEATURE_ICONS[f.id]
              const w = featureWords(f.id, say)
              return (
                <li key={f.id}>
                  <Link to={f.to} data-guide-feature={f.id}
                    className="group flex h-full items-start gap-3 rounded-2xl border border-a-border bg-a-surface p-4 transition hover:border-a-accent-text/40 hover:shadow-a-sm [@media(hover:hover)]:hover:-translate-y-0.5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-a-accent/10 text-a-accent-text"><Icon size={20} aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-a-text">{w.title}</span>
                      <span className="block text-sm text-a-text-2">{w.line}</span>
                    </span>
                    <ArrowRight size={16} aria-hidden className="mt-1 shrink-0 text-a-text-2 opacity-0 transition group-hover:opacity-100" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {!searching && <ScanDemo />}

      <section aria-labelledby="guide-faq" className="space-y-3">
        <SectionTitle id="guide-faq" icon={CircleHelp}>{t('loyalty.guide.page.faq', 'Questions')}</SectionTitle>
        <div role="group" aria-label={t('loyalty.guide.page.faq', 'Questions')} className="flex flex-wrap gap-2">
          {(['all', ...TOPICS] as const).map(id => {
            const Icon = TOPIC_ICONS[id]
            const on = topic === id
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => setTopic(id)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${on
                  ? 'border-transparent bg-a-accent text-a-accent-ink'
                  : 'border-a-border bg-a-surface text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'}`}>
                <Icon size={15} aria-hidden />{id === 'all' ? t('loyalty.guide.page.all', 'All') : topicWord(id, say)}
              </button>
            )
          })}
        </div>
        <ul className="grid items-start gap-3 lg:grid-cols-2">
          {FAQ.filter(f => found.faq.includes(f.id)).map(f => <Question key={`${f.id}-${searching}`} id={f.id} to={f.to} open={searching} say={say} />)}
        </ul>
        {nothing && (
          <p className="flex items-center gap-2 rounded-2xl border border-dashed border-a-border p-5 text-sm text-a-text-2">
            <SearchX size={18} aria-hidden />{t('loyalty.guide.page.nothing', 'Nothing found. Try other words.')}
          </p>
        )}
      </section>
    </div>
  )
}

function SectionTitle({ id, icon: Icon, children }: { id: string; icon: LucideIcon; children: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2 font-a-display text-2xl text-a-text">
      <Icon size={20} aria-hidden className="text-a-accent-text" />{children}
    </h2>
  )
}

/** The quick start: five numbered steps, each opening the page where it is done. */
function QuickStart({ say }: { say: Say }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="guide-start" className="space-y-3">
      <SectionTitle id="guide-start" icon={Rocket}>{t('loyalty.guide.page.start', 'Quick start')}</SectionTitle>
      <ol className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <span aria-hidden className="absolute left-6 right-6 top-9 hidden h-0.5 rounded-full bg-gradient-to-r from-a-accent/50 via-a-accent/20 to-a-accent/50 lg:block" />
        {STEPS.map((s, i) => {
          const Icon = STEP_ICONS[s.id]
          const w = stepWords(s.id, say)
          return (
            <li key={s.id} className="relative">
              <Link to={s.to} data-guide-step={s.id}
                className="group flex h-full flex-col gap-3 rounded-2xl border border-a-border bg-a-surface p-4 transition hover:border-a-accent-text/40 hover:shadow-a-sm [@media(hover:hover)]:hover:-translate-y-0.5">
                <span className="flex items-center gap-2">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-a-accent text-sm font-semibold text-a-accent-ink shadow-a-sm">{i + 1}</span>
                  <Icon size={18} aria-hidden className="text-a-accent-text" />
                  <span className="sr-only">{t('loyalty.guide.page.step', 'Step {{n}}', { n: i + 1 })}</span>
                </span>
                <span className="space-y-1">
                  <span className="block font-semibold text-a-text">{w.title}</span>
                  <span className="block text-sm text-a-text-2">{w.line}</span>
                </span>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-a-accent-text">
                  {t('loyalty.guide.page.open', 'Open')}<ArrowRight size={14} aria-hidden />
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** One question: the answer folds out under it, with a way to the page where it is done. */
function Question({ id, to, open, say }: { id: FaqId; to?: string; open: boolean; say: Say }) {
  const { t } = useTranslation()
  const w = faqWords(id, say)
  return (
    <li>
      <details open={open || undefined} data-guide-faq={id} className="group rounded-2xl border border-a-border bg-a-surface transition-colors open:border-a-accent-text/40 open:shadow-a-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 font-medium text-a-text [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-a-accent/10 text-a-accent-text"><CircleHelp size={16} /></span>
          <span className="min-w-0 flex-1">{w.q}</span>
          <ChevronDown size={18} aria-hidden className="shrink-0 text-a-text-2 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 px-4 pb-4 pl-[3.75rem] text-sm text-a-text-2 animate-a-fade">
          <p>{w.a}</p>
          {to && (
            <Link to={to} className="inline-flex items-center gap-1 font-semibold text-a-accent-text hover:underline">
              {t('loyalty.guide.page.open', 'Open')}<ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </div>
      </details>
    </li>
  )
}

/** The hero's drifting icons, on a wide screen only (below xl they would sit on the search): the workspace at a glance. */
function Floating() {
  const spots: [LucideIcon, string, string][] = [
    [ScanLine, 'right-10 top-8', 'animate-a-float'],
    [Crown, 'right-36 top-16', 'animate-a-float [animation-delay:1.5s]'],
    [CalendarDays, 'right-16 bottom-10', 'animate-a-float [animation-delay:3s]'],
    [Gift, 'right-44 bottom-6', 'animate-a-float [animation-delay:4.5s]'],
  ]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
      {spots.map(([Icon, where, motion]) => (
        <span key={where} className={`absolute ${where} ${motion} grid h-14 w-14 place-items-center rounded-2xl border border-a-border bg-a-surface/80 text-a-accent-text shadow-a-sm`}>
          <Icon size={26} />
        </span>
      ))}
    </div>
  )
}
