import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, Check, Coins, Crown, Gift, Image, PartyPopper, Rocket, ScanLine, UserPlus, WandSparkles, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { points } from '../lib/format'
import { START } from '../options/SetupBanner'
import { startApi } from './startApi'
import { START_KEY, STEP_HUE, STEP_TO, knownSteps, nextStep, stillToDo, type StartAnswer, type StartStep } from './startMath'
import { STEP_COUNT_WORDS, STEP_LINE_WORDS, STEP_TITLE_WORDS } from './words'

const STEP_ICONS: Record<string, LucideIcon> = {
  programme: WandSparkles, tiers: Crown, ways: Coins, rewards: Gift, logo: Image, member: UserPlus, scan: ScanLine,
}
const SECONDARY = 'inline-flex items-center gap-2 rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2'

/**
 * "Start here" (release 10, owner 2026-10-26: "users could go inside the app without any knowledge and they could
 * manage and easy use all the tools"): how far the programme is set up, then each step in order — done, or the page
 * that does it, the next one first in its colour. The steps and whether each is done are the server's (SetupProgress);
 * the list ticks itself as staff work. Everyone reads it; each page it opens keeps its own rights.
 */
export function StartPage() {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: START_KEY, queryFn: startApi.progress })
  const data = query.data

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <PageHeader stacked title={t('loyalty.start.title', 'Get started')}
        line={t('loyalty.start.line', 'Set your programme up step by step. Each step opens the page that does it, and ticks itself once it is done.')}>
        <Link to="/loyalty/guide" className={SECONDARY}><BookOpen size={15} aria-hidden />{t('loyalty.guide.page.title', 'Guide')}</Link>
      </PageHeader>

      {query.isError && !data && (
        <div className="max-w-xl space-y-3">
          <Notice tone="danger">{t(...errorKey('load', failureOf(query.error)))}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>
        </div>
      )}
      {!data && query.isLoading && (
        <div role="status" className="space-y-3">
          <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
          <Skeleton className="h-28" /><Skeleton className="h-20" /><Skeleton className="h-20" />
        </div>
      )}

      {data && (
        <>
          <Progress answer={data} />
          <ol aria-label={t('loyalty.start.steps', 'Setup steps')} className="space-y-3">
            {knownSteps(data).map((step, i) => <StepRow key={step.key} step={step} place={i + 1} next={nextStep(data)?.key === step.key} />)}
          </ol>
        </>
      )}
    </div>
  )
}

/** How far it is: "n of 7 done" with its bar, or that everything is set. */
function Progress({ answer }: { answer: StartAnswer }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const steps = knownSteps(answer)
  const done = steps.filter(step => step.done).length
  const all = !stillToDo(answer)
  const Icon = all ? PartyPopper : Rocket
  return (
    <section data-progress={all ? 'done' : 'open'} data-hue={all ? 'earn' : 'tier'} aria-labelledby="start-progress"
      className="l-hue-panel flex flex-wrap items-center gap-4 rounded-2xl border p-4 sm:p-5">
      <span aria-hidden className="l-hue-tile inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"><Icon size={24} /></span>
      <div className="min-w-[12rem] flex-1 space-y-2">
        <h2 id="start-progress" className="font-a-display text-2xl font-normal text-a-text">
          {all
            ? t('loyalty.start.all_done', 'All set: your programme is ready')
            : t('loyalty.start.progress', '{{done}} of {{total}} done', { done: points(done, locale), total: points(steps.length, locale) })}
        </h2>
        <div aria-hidden className="h-2 overflow-hidden rounded-full bg-a-surface-2">
          <div className="l-hue-bar h-full rounded-full transition-[width]" style={{ width: `${steps.length ? Math.round((done / steps.length) * 100) : 0}%` }} />
        </div>
        {all && <p className="text-sm text-a-text-2">{t('loyalty.start.all_done_line', 'Every step is done. The Guide answers what comes next.')}</p>}
      </div>
    </section>
  )
}

/** One step: its number (or a tick), its title and line, what it counts, and the page that does it. */
function StepRow({ step, place, next }: { step: StartStep; place: number; next: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const Icon = step.done ? Check : STEP_ICONS[step.key] ?? Rocket
  const counted = STEP_COUNT_WORDS[step.key] && step.count > 0
  return (
    <li data-step={step.key} data-done={step.done ? '' : undefined} data-next={next ? '' : undefined} data-hue={step.done ? 'earn' : STEP_HUE[step.key]}
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border p-4 ${next ? 'l-hue-card' : 'border-a-border bg-a-surface'}`}>
      <span aria-hidden className="l-hue-tile inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"><Icon size={20} /></span>
      <div className="min-w-[14rem] flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-a-text">
          <span className="tabular-nums text-a-text-2">{place}.</span>
          {t(`loyalty.start.step_title.${step.key}`, STEP_TITLE_WORDS[step.key] ?? step.key)}
          {step.done && <span data-state="fulfilled" className="l-st-tint l-st-text rounded-full px-2 py-0.5 text-xs font-semibold">{t('loyalty.start.done', 'Done')}</span>}
          {counted && (
            <span className="rounded-full bg-a-surface-2 px-2 py-0.5 text-xs font-semibold tabular-nums text-a-text-2">
              {t(`loyalty.start.step_count.${step.key}`, STEP_COUNT_WORDS[step.key], { n: points(step.count, locale) })}
            </span>
          )}
        </p>
        <p className="text-sm text-a-text-2">{t(`loyalty.start.step_line.${step.key}`, STEP_LINE_WORDS[step.key] ?? '')}</p>
      </div>
      <Link to={STEP_TO[step.key]} className={next ? START : SECONDARY}>
        {next ? t('loyalty.start.do_next', 'Do this next') : t('loyalty.start.open', 'Open')}
        <span className="sr-only"> {t(`loyalty.start.step_title.${step.key}`, STEP_TITLE_WORDS[step.key] ?? step.key)}</span>
        <ArrowRight size={15} aria-hidden />
      </Link>
    </li>
  )
}

/**
 * The Members card (release 10): for a manager, while a step is left, how far the setup is and the next step, with
 * Continue. It replaces the wizard's banner there — the wizard is the first step.
 */
export function StartCard() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const manager = boot.staff.can.manage_program
  const query = useQuery({ queryKey: START_KEY, queryFn: startApi.progress, enabled: manager })
  const data = query.data
  if (!manager || !data || !stillToDo(data)) return null
  const next = nextStep(data)
  const steps = knownSteps(data)
  return (
    <div data-start-card="" data-hue="tier" className="l-hue-panel flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border p-4 sm:p-5">
      <span aria-hidden className="l-hue-tile inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"><Rocket size={22} /></span>
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-semibold text-a-text">
          {t('loyalty.start.card_title', 'Set up your programme: {{done}} of {{total}} done', {
            done: points(steps.filter(step => step.done).length, locale), total: points(steps.length, locale),
          })}
        </p>
        {next && (
          <p className="text-sm text-a-text-2">
            {t('loyalty.start.card_next', 'Next: {{step}}', { step: t(`loyalty.start.step_title.${next.key}`, STEP_TITLE_WORDS[next.key] ?? next.key) })}
          </p>
        )}
      </div>
      <Link to="/loyalty/start" className={START}>{t('loyalty.start.continue', 'Continue')}<ArrowRight size={15} aria-hidden /></Link>
    </div>
  )
}
