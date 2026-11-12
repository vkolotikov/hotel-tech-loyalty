import { useId, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { InfoTip } from '../ui/InfoTip'
import { Toggle } from '../ui/inputs'
import { sectionAfter } from '../ui/SectionNav'
import { TONE_CHIP, type Tone } from '../ui/tones'
import { neighbours } from './sectionLogic'

export interface FormPart<T extends string> {
  key: T
  icon: LucideIcon
  title: string
  tone?: Tone
  /** A field in this part would be refused: the list marks it so the person finds it. */
  flagged?: boolean
  /** A count beside the title (what waits there). */
  badge?: number
}

/**
 * A long Set up form in parts (round 5, owner 2026-11-12: "tabs, not long scrolls"): a left list of the parts with their
 * icons on a wide screen, a strip of tabs on a phone, the open part beside it and, when given, an `aside` that stays in
 * view (the widget's preview). One tab stop for the list; the arrow keys, Home and End move. The page keeps the open
 * part in its address (`?part=`, sectionLogic.ts). A part with a refused field carries a dot.
 */
export function SectionedForm<T extends string>({ label, idPrefix, parts, value, onChange, aside, next: offerNext = true, children }: {
  label: string
  idPrefix: string
  parts: FormPart<T>[]
  value: T
  onChange: (next: T) => void
  aside?: ReactNode
  /** A "Next: …" button at the foot of a part (a form's parts follow one another; a set of lists' do not). */
  next?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const keys = parts.map(p => p.key)
  const panelId = `${idPrefix}-panel`
  const go = (next: T) => {
    onChange(next)
    document.getElementById(`${idPrefix}-${next}`)?.focus()
  }
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = sectionAfter(keys, value, e.key)
    if (!next) return
    e.preventDefault()
    go(next)
  }
  const after = neighbours(keys, value).next
  const nextPart = offerNext ? parts.find(p => p.key === after) : undefined

  return (
    <div className={`grid min-w-0 items-start gap-4 lg:grid-cols-[11.5rem_minmax(0,1fr)] ${aside ? 'xl:grid-cols-[12rem_minmax(0,1fr)_minmax(0,20rem)]' : ''}`}>
      <div className="min-w-0 lg:sticky lg:top-4">
        <div role="tablist" aria-label={label}
          className="flex gap-1 overflow-x-auto rounded-xl bg-a-surface-2/60 p-1 [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:rounded-2xl lg:border lg:border-a-border lg:bg-a-surface lg:p-1.5 lg:shadow-a-sm">
          {parts.map(({ key, icon: Icon, title, tone = 'neutral', flagged, badge }) => {
            const on = key === value
            return (
              <button key={key} type="button" role="tab" id={`${idPrefix}-${key}`} aria-selected={on} aria-controls={panelId} tabIndex={on ? 0 : -1}
                data-part={key} onClick={() => onChange(key)} onKeyDown={onKey}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-a-accent lg:w-full ${on ? 'bg-a-accent/15 text-a-text' : 'text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'}`}>
                <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${TONE_CHIP[tone]}`}><Icon size={15} /></span>
                <span className="min-w-0 whitespace-nowrap lg:flex-1 lg:truncate">{title}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="shrink-0 rounded-full bg-a-surface-2 px-1.5 text-center text-xs font-semibold leading-5 text-a-text">{badge}</span>
                )}
                {flagged && (
                  <span className="shrink-0">
                    <span aria-hidden className="block h-2 w-2 rounded-full bg-a-danger" />
                    <span className="sr-only">{t('crm.settings.form.flagged', 'needs a fix')}</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={`${idPrefix}-${value}`} className="min-w-0 space-y-4">
        <div key={value} className="space-y-4 animate-a-fade">{children}</div>
        {nextPart && (
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => go(nextPart.key)}>
              {t('crm.settings.form.next', 'Next: {{part}}', { part: nextPart.title })}<ArrowRight size={14} aria-hidden />
            </Button>
          </div>
        )}
      </div>
      {aside && <aside className="min-w-0 lg:col-start-2 xl:sticky xl:top-4 xl:col-start-auto">{aside}</aside>}
    </div>
  )
}

/** A part's body: a raised surface without a title (the list beside it already names the part). */
export function PartCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 space-y-4 rounded-2xl border border-a-border bg-a-surface p-4 shadow-a-sm ${className}`}>{children}</section>
}

/** A small heading inside a part, with an (i) for what the group is for. */
export function PartHeading({ icon: Icon, title, tip, action }: { icon?: LucideIcon; title: string; tip?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      {Icon && <Icon size={15} aria-hidden className="shrink-0 text-a-text-2" />}
      <h3 className="min-w-0 truncate text-sm font-semibold text-a-text">{title}</h3>
      {tip && <InfoTip text={tip} />}
      {action && <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

/**
 * A labelled control whose explanation is an (i) beside the label, not a sentence under it (round 5: "helper sentences
 * only where they prevent a mistake"). The label names the control by its id; the (i) sits outside the label, so a
 * press on it never lands on the control.
 */
export function TipField({ label, tip, children }: { label: string; tip?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="min-w-0">
      <div className="mb-1 flex min-h-5 items-center gap-1">
        <label htmlFor={id} className="text-xs font-medium text-a-text-2">{label}</label>
        {tip && <InfoTip text={tip} />}
      </div>
      {children(id)}
    </div>
  )
}

/** A switch with its explanation as an (i). */
export function TipToggle({ label, tip, checked, onChange, disabled = false }: { label: string; tip?: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-1">
      <Toggle label={label} checked={checked} onChange={onChange} disabled={disabled} />
      {tip && <span className="mt-0.5"><InfoTip text={tip} /></span>}
    </div>
  )
}
