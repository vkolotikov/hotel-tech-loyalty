import { useId, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Undo2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Eyebrow } from '../../workspace/ui/Typography'
import { failureOf, type ApiFailure } from '../lib/api'
import { useFirstFocus } from '../lib/useFirstFocus'
import { ConfirmDialog } from '../ui/formParts'
import { badTimeReason, laterProblem, scheduledWhen, timeProblemOf, venueClockNow, type SendMode } from './scheduleMath'
import { SCHEDULE_PROBLEM_WORDS, SCHEDULE_REASON_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Send later's pieces (spec 2026-10-22 release 4 §5), shared by email campaigns, push messages and SMS: the choice
 * between now and a time on the venue's clock in each send dialog, the panel a waiting send shows (move it, take it
 * back to a draft), and the line a send that could not start when it was due shows. Their words are Campaigns'
 * (`loyalty.campaigns.schedule.*`); each area passes its own calls and its own refusal words.
 */

/** Now, or later at a time on the venue's clock, with what is wrong with the time typed. */
export function WhenChoice({ mode, at, timeZone, problem, onMode, onAt }: {
  mode: SendMode
  at: string
  timeZone: string
  /** A reason code (scheduleMath `laterProblem`, or the server's `bad_time` reason), or null. */
  problem: string | null
  onMode: (mode: SendMode) => void
  onAt: (at: string) => void
}) {
  const { t } = useTranslation()
  const name = useId()
  const choice = (value: SendMode, label: string) => (
    <label className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${mode === value ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border bg-a-surface text-a-text-2'}`}>
      <input type="radio" name={name} value={value} checked={mode === value} onChange={() => onMode(value)} className="h-4 w-4 accent-a-accent-text" />
      {label}
    </label>
  )
  return (
    <fieldset className="space-y-2" data-when={mode}>
      <legend className="sr-only">{t('loyalty.campaigns.schedule.when', 'When it goes out')}</legend>
      <div className="flex flex-wrap gap-2">
        {choice('now', t('loyalty.campaigns.schedule.now', 'Send now'))}
        {choice('later', t('loyalty.campaigns.schedule.later', 'Send later'))}
      </div>
      {mode === 'later' && (
        <div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('loyalty.campaigns.schedule.at', 'Date and time')}</span>
            <input type="datetime-local" value={at} step={60} onChange={(e) => onAt(e.target.value)} className={INPUT} aria-invalid={problem ? true : undefined} />
          </label>
          <p className="mt-1 text-xs text-a-text-2">{t('loyalty.campaigns.schedule.zone', 'On the venue’s clock ({{zone}}).', { zone: timeZone })}</p>
          {problem && <p className="mt-1 text-xs font-medium text-a-danger">{t(`loyalty.campaigns.schedule_reason.${problem}`, SCHEDULE_REASON_WORDS[problem] ?? SCHEDULE_REASON_WORDS.format)}</p>}
        </div>
      )}
    </fieldset>
  )
}

/**
 * A waiting send's panel: when it goes out (the venue's clock), that it goes to whoever can receive it then, and Change
 * time and Take back to a draft, each confirmed. `refusal` puts a refused call in the area's own words.
 */
export function ScheduledPanel({ wall, timeZone, today, by, onMove, onTakeBack, refusal }: {
  wall: string | null
  timeZone: string
  today: string
  by: string | null
  onMove: (at: string) => Promise<unknown>
  onTakeBack: () => Promise<unknown>
  refusal: (family: 'schedule' | 'unschedule', failure: ApiFailure) => ReactNode
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const [open, setOpen] = useState<'move' | 'back' | null>(null)
  const back = useMutation({ mutationFn: onTakeBack, onSuccess: () => setOpen(null) })
  const failure = back.isError ? failureOf(back.error) : null

  return (
    <section aria-labelledby="schedule-panel" className="max-w-2xl space-y-3 rounded-2xl border border-a-border bg-a-surface p-5" data-scheduled={wall ?? ''}>
      <Eyebrow><span id="schedule-panel">{t('loyalty.campaigns.schedule.title', 'Scheduled')}</span></Eyebrow>
      <p className="text-lg font-medium text-a-text">
        {t('loyalty.campaigns.schedule.goes_out', 'It goes out {{when}}, on the venue’s clock.', { when: scheduledWhen(wall, locale) })}
      </p>
      <p className="text-sm text-a-text-2">{t('loyalty.campaigns.schedule.whoever', 'It goes to whoever can receive it at that moment, counted then. Until then it can be moved or taken back to a draft.')}</p>
      {by && <p className="text-xs text-a-text-2">{t('loyalty.campaigns.schedule.by', 'Scheduled by {{name}}', { name: by })}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setOpen('move')}><CalendarClock size={15} aria-hidden />{t('loyalty.campaigns.schedule.move', 'Change time')}</Button>
        <Button variant="ghost" onClick={() => setOpen('back')}><Undo2 size={15} aria-hidden />{t('loyalty.campaigns.schedule.take_back', 'Take back to a draft')}</Button>
      </div>
      {open === 'move' && <MoveDialog wall={wall} timeZone={timeZone} today={today} onMove={onMove} refusal={refusal} onClose={() => setOpen(null)} />}
      {open === 'back' && (
        <ConfirmDialog title={t('loyalty.campaigns.schedule.back_title', 'Take it back to a draft?')}
          confirm={t('loyalty.campaigns.schedule.back_confirm', 'Take back')} keep={t('loyalty.campaigns.schedule.back_keep', 'Keep it scheduled')}
          busy={back.isPending} failure={null} onConfirm={() => back.mutate()} onClose={() => setOpen(null)}>
          <p>{t('loyalty.campaigns.schedule.back_body', 'Nothing is sent. It becomes a draft again, to change or to send another time.')}</p>
          {failure && refusal('unschedule', failure)}
        </ConfirmDialog>
      )}
    </section>
  )
}

/** Another time for a waiting send. */
function MoveDialog({ wall, timeZone, today, onMove, refusal, onClose }: {
  wall: string | null
  timeZone: string
  today: string
  onMove: (at: string) => Promise<unknown>
  refusal: (family: 'schedule' | 'unschedule', failure: ApiFailure) => ReactNode
  onClose: () => void
}) {
  const { t } = useTranslation()
  const first = useFirstFocus<HTMLButtonElement>()
  const [at, setAt] = useState(wall ?? `${today}T10:00`)
  const [tried, setTried] = useState(false)
  const move = useMutation({ mutationFn: (value: string) => onMove(value), onSuccess: onClose })
  const failure = move.isError ? failureOf(move.error) : null
  const problem = timeProblemOf(at, timeZone, tried, failure)
  return (
    <Dialog title={t('loyalty.campaigns.schedule.move_title', 'Change when it goes out')} onClose={onClose} busy={move.isPending}>
      <div className="space-y-4 text-sm text-a-text">
        <WhenChoice mode="later" at={at} timeZone={timeZone} problem={problem} onMode={() => {}} onAt={(v) => { setAt(v); if (move.isError) move.reset() }} />
        {failure && !badTimeReason(failure) && refusal('schedule', failure)}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button ref={first} type="button" onClick={onClose} disabled={move.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2 disabled:pointer-events-none disabled:opacity-50">
            {t('loyalty.campaigns.schedule.move_keep', 'Keep the time')}
          </button>
          <Button type="button" loading={move.isPending} onClick={() => {
            setTried(true)
            if (laterProblem(at, venueClockNow(timeZone)) === null) move.mutate(at)
          }}>
            <CalendarClock size={15} aria-hidden />{t('loyalty.campaigns.schedule.move_confirm', 'Move it')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** A send that was due but did not start, and why (the server's code). */
export function ScheduleFailed({ problem, wall }: { problem: string; wall: string | null }) {
  const { t, i18n } = useTranslation()
  const why = problem in SCHEDULE_PROBLEM_WORDS ? t(`loyalty.campaigns.schedule_problem.${problem}`, SCHEDULE_PROBLEM_WORDS[problem]) : problem
  return (
    <div className="max-w-2xl" data-schedule-problem={problem}>
      <Notice tone="warning">
        {t('loyalty.campaigns.schedule.did_not_start', 'It was due {{when}} but did not start: {{why}} Nothing was sent. Duplicate it to send it again.', {
          when: scheduledWhen(wall, i18n.language || 'en'), why,
        })}
      </Notice>
    </div>
  )
}
