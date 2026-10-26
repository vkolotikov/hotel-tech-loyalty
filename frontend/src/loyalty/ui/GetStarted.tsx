import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Hue } from './sections'

export interface GetStartedStep {
  title: string
  line: string
}

/**
 * An empty section that teaches (release 10, the owner's Figma 163:322 and 163:400): a panel in the section's colour
 * with "Get started" (or "Optional"), a heading, a line, three numbered steps and the action that starts it — or, for
 * staff who may not act, who can. An example in figures sits beside the steps where it helps ("100 → 200 points").
 */
export function GetStarted({ hue, optional = false, title, line, steps, action, who, example, name }: {
  hue: Hue
  optional?: boolean
  title: string
  line: string
  steps: GetStartedStep[]
  /** The button that starts it; without one the panel says who sets it up. */
  action?: ReactNode
  /** Who sets it up, when no action is offered; null when the page already says it. */
  who?: string | null
  example?: ReactNode
  /** What the panel is about, for tests and the address of its section (`data-get-started`). */
  name: string
}) {
  const { t } = useTranslation()
  return (
    <section data-get-started={name} data-hue={hue} aria-label={title} className="l-hue-panel rounded-2xl border p-5 sm:p-7">
      <div className={`grid items-start gap-6 ${example ? 'xl:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]' : ''}`}>
        <div className="space-y-5">
          <div className="space-y-3">
            <span className="l-hue-tile inline-flex rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide">
              {optional ? t('loyalty.common.optional', 'Optional') : t('loyalty.common.get_started', 'Get started')}
            </span>
            <h2 className="font-a-display text-3xl font-normal leading-tight text-a-text">{title}</h2>
            <p className="max-w-2xl text-sm text-a-text-2 sm:text-base">{line}</p>
          </div>
          <ol className="space-y-2.5">
            {steps.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3 rounded-xl border border-a-border bg-a-surface px-4 py-3">
                <span aria-hidden className="l-hue-tile inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-medium text-a-text">{step.title}</span>
                  <span className="block text-sm text-a-text-2">{step.line}</span>
                </span>
              </li>
            ))}
          </ol>
          {action
            ? <div className="flex flex-wrap items-center gap-2">{action}</div>
            : who !== null && <p data-managers-only="" className="text-sm text-a-text-2">{who ?? t('loyalty.common.managers_set_up', 'An owner or a manager sets this up.')}</p>}
        </div>
        {example}
      </div>
    </section>
  )
}

/** An example in figures beside a Get started panel: a chip, a name, the figures large in the colour, a line. */
export function GetStartedExample({ hue, title, figures, line }: { hue: Hue; title: string; figures: string; line: string }) {
  const { t } = useTranslation()
  return (
    <div data-example="" data-hue={hue} className="l-hue-card space-y-3 rounded-2xl border p-5">
      <span className="inline-flex rounded-md bg-a-surface px-2 py-1 text-xs font-semibold uppercase tracking-wide text-a-text-2">{t('loyalty.common.example', 'Example')}</span>
      <p className="font-semibold text-a-text">{title}</p>
      <p className="l-hue-text font-a-display text-3xl tabular-nums">{figures}</p>
      <p className="text-sm text-a-text-2">{line}</p>
    </div>
  )
}

/** A section's opening line in its colour: what it is for and how it works, in a sentence (the owner's 163:244). */
export function SectionIntro({ hue, children }: { hue: Hue; children: ReactNode }) {
  return <p data-section-intro="" data-hue={hue} className="l-hue-panel rounded-xl border px-4 py-3 text-sm text-a-text">{children}</p>
}
