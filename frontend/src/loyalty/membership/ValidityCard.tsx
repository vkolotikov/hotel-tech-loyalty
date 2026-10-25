import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, CalendarPlus, CalendarX2 } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Eyebrow } from '../../workspace/ui/Typography'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { refusalKey } from '../lib/errors'
import type { MemberRow } from '../lib/types'
import { useFirstFocus } from '../lib/useFirstFocus'
import { ConfirmDialog, FormField, FormFoot, ToneBadge } from '../ui/formParts'
import { afterMemberChange, membershipApi } from './api'
import { ERRORS } from './errors'
import type { ValidityAnswer } from './types'
import {
  EXTENSIONS, dateProblem, extendBody, extendedEnd, firstEndDay, headlineOf, setBody, stateTone, validityActions,
  type Extension, type MembershipState, type ValidityHeadline,
} from './validityMath'
import { EXTEND_WORDS, LEFT_WORDS, VALIDITY_PROBLEM_WORDS, VALIDITY_STATE_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'
const LONG: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

type Member = MemberRow & { is_erased?: boolean }
type Say = (key: string, fallback: string, vars?: Record<string, unknown>) => string

/**
 * A member's membership on their page (release 8, spec 2026-10-25 §3, R8-2): until when it holds — "Valid until 3 Oct
 * 2027 · 1 year 2 months left", "No end date", "Ends in 5 days" (amber), "Expired on 3 Oct" (red) — and, for a manager,
 * Extend (+1 month, +3 months, +6 months, +1 year, each saying the new end before it is saved), Set a date and Remove the
 * end date. Everyone else reads it. After a change the card says what was saved, and the member's page and the list are
 * read again. The state is the server's; the venue's today is the bootstrap's.
 */
export function ValidityCard({ member, locale }: { member: Member; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  const say: Say = (key, fallback, vars) => t(key, fallback, vars ?? {})
  const boot = useBoot()
  const client = useQueryClient()
  const today = boot.venue.today
  const titleId = useId()
  const choicesId = useId()
  const [choosing, setChoosing] = useState(false)
  const [dialog, setDialog] = useState<'set' | 'remove' | null>(null)
  const [key, setKey] = useState(() => newPressKey())
  const [done, setDone] = useState<ValidityAnswer | null>(null)
  // The page's member as it stood when the answer came: until it is read again, the card shows the answer.
  const [before, setBefore] = useState<string | null | undefined>(undefined)
  const { change } = validityActions(boot.staff.can, member)

  const extend = useMutation({
    mutationFn: (choice: Extension) => membershipApi.validity(member.id, extendBody(choice, key)),
    onSuccess: (answer) => { finish(answer); setChoosing(false) },
  })
  const finish = (answer: ValidityAnswer) => {
    setDone(answer)
    setBefore(member.valid_until ?? null)
    setKey(newPressKey())
    setDialog(null)
    afterMemberChange(client, member.id)
  }

  if (member.is_erased) return null
  const stale = done !== null && (member.valid_until ?? null) === before
  const shown: Member = done && stale ? { ...member, valid_until: done.valid_until, membership_state: done.state } : member
  const headline = headlineOf(shown, today)
  const state: MembershipState = shown.membership_state ?? (shown.is_active ? 'active' : 'off')
  const day = (date: string) => formatDate(date, locale, LONG)
  const failure = extend.isError ? failureOf(extend.error) : null

  return (
    <section aria-labelledby={titleId} data-validity={headline.kind} className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow><span id={titleId}>{t('loyalty.membership.validity.title', 'Membership')}</span></Eyebrow>
        <ToneBadge tone={stateTone(state)}>{t(`loyalty.membership.validity.state.${state}`, VALIDITY_STATE_WORDS[state] ?? state)}</ToneBadge>
      </div>

      <div className="flex items-start gap-3">
        <span aria-hidden className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${headline.kind === 'expired' ? 'bg-a-danger/10 text-a-danger' : 'bg-a-surface-2 text-a-text-2'}`}>
          {headline.kind === 'expired' ? <CalendarX2 size={20} /> : <CalendarClock size={20} />}
        </span>
        <div className="min-w-0">
          <p data-validity-line="" className={`font-a-display text-2xl font-normal leading-snug ${headline.kind === 'expired' ? 'text-a-danger' : 'text-a-text'}`}>
            {headlineText(headline, say, day)}
          </p>
          <p className="text-sm text-a-text-2">{detailText(headline, say, day)}</p>
        </div>
      </div>

      {done && (
        <div aria-live="polite">
          <Notice tone="success">
            {done.valid_until
              ? t('loyalty.membership.validity.saved', 'Saved: valid until {{day}}.', { day: day(done.valid_until) })
              : t('loyalty.membership.validity.saved_none', 'Saved: the membership has no end date.')}
          </Notice>
        </div>
      )}
      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'validity', failure))}</Notice>}

      {change ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" aria-expanded={choosing} aria-controls={choicesId} onClick={() => { setChoosing(c => !c); extend.reset() }}>
              <CalendarPlus size={15} aria-hidden />{t('loyalty.membership.validity.extend_action', 'Extend')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setDone(null); setDialog('set') }}>{t('loyalty.membership.validity.set', 'Set a date')}</Button>
            {shown.valid_until && (
              <Button size="sm" variant="ghost" onClick={() => { setDone(null); setDialog('remove') }}>{t('loyalty.membership.validity.remove', 'Remove the end date')}</Button>
            )}
          </div>
          {choosing && (
            <div id={choicesId} role="group" aria-label={t('loyalty.membership.validity.extend_by', 'Extend by')} className="space-y-2">
              <p className="text-xs text-a-text-2">
                {shown.valid_until && shown.valid_until > today
                  ? t('loyalty.membership.validity.from_end', 'From the current end, {{day}}.', { day: day(shown.valid_until) })
                  : t('loyalty.membership.validity.from_today', 'From today.')}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {EXTENSIONS.map(choice => {
                  const end = extendedEnd(shown.valid_until, today, choice)
                  const label = t(`loyalty.membership.validity.extend.${choice}`, EXTEND_WORDS[choice])
                  const until = t('loyalty.membership.validity.new_end', 'until {{day}}', { day: day(end) })
                  return (
                    <li key={choice}>
                      <button type="button" data-extend={choice} disabled={extend.isPending} onClick={() => extend.mutate(choice)}
                        className="flex w-full flex-col items-start rounded-xl border border-a-border bg-a-surface px-3 py-2 text-left hover:bg-a-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-a-accent-text disabled:opacity-60">
                        <span className="text-sm font-semibold text-a-text">{label}</span>
                        <span className="text-xs tabular-nums text-a-text-2">{until}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-a-text-2">{t('loyalty.membership.validity.managers_only', 'Only an owner or a manager can change the end date.')}</p>
      )}

      {dialog === 'set' && (
        <SetDateDialog member={shown} today={today} pressKey={key} onClose={() => setDialog(null)} onDone={finish} />
      )}
      {dialog === 'remove' && (
        <RemoveDialog member={shown} pressKey={key} onClose={() => setDialog(null)} onDone={finish} />
      )}
    </section>
  )
}

/** The card's first line, in the state's words. */
function headlineText(h: ValidityHeadline, say: Say, day: (d: string) => string): string {
  switch (h.kind) {
    case 'none':
      return say('loyalty.membership.validity.none', 'No end date')
    case 'active':
      return say('loyalty.membership.validity.until', 'Valid until {{day}}', { day: day(h.until) })
    case 'expiring':
      return h.days === 0
        ? say('loyalty.membership.validity.ends_today', 'Ends today')
        : h.days === 1
          ? say('loyalty.membership.validity.ends_tomorrow', 'Ends tomorrow')
          : say('loyalty.membership.validity.ends_in', 'Ends in {{days}} days', { days: String(h.days) })
    case 'expired':
      return say('loyalty.membership.validity.expired_on', 'Expired on {{day}}', { day: day(h.until) })
    case 'off':
      return h.until
        ? say('loyalty.membership.validity.until', 'Valid until {{day}}', { day: day(h.until) })
        : say('loyalty.membership.validity.none', 'No end date')
  }
}

/** The line under it: the time left, what an end date does, or what happens now. */
function detailText(h: ValidityHeadline, say: Say, day: (d: string) => string): string {
  switch (h.kind) {
    case 'none':
      return say('loyalty.membership.validity.none_line', 'The membership never ends. Give it an end date when a member buys one for a time.')
    case 'active':
      return say('loyalty.membership.validity.left_line', '{{left}} left.', { left: leftText(h.left, say) })
    case 'expiring':
      return say('loyalty.membership.validity.expiring_line', 'Valid until {{day}}. After it, places refuse entry until it is renewed.', { day: day(h.until) })
    case 'expired':
      return say('loyalty.membership.validity.expired_line', 'Places refuse entry until it is renewed. Points and history stay, and the desk can still serve the member.')
    case 'off':
      return say('loyalty.membership.validity.off_line', 'The account is switched off, so places refuse entry whatever the date.')
  }
}

/** "1 year 2 months", "3 months 4 days", "12 days": the two largest parts there are. */
export function leftText(left: { years: number; months: number; days: number }, say: Say): string {
  const part = (unit: 'years' | 'months' | 'days', n: number) => n === 1
    ? say(`loyalty.membership.validity.left.${unit}_one`, LEFT_WORDS[`${unit}_one`])
    : say(`loyalty.membership.validity.left.${unit}_many`, LEFT_WORDS[`${unit}_many`], { n: String(n) })
  const all = ([['years', left.years], ['months', left.months], ['days', left.days]] as const).filter(([, n]) => n > 0)
  if (all.length === 0) return part('days', 0)
  return all.slice(0, 2).map(([unit, n]) => part(unit, n)).join(' ')
}

/** Set a date: the last day the membership holds, today or later. */
function SetDateDialog({ member, today, pressKey, onClose, onDone }: {
  member: Member; today: string; pressKey: string; onClose: () => void; onDone: (answer: ValidityAnswer) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const first = useFirstFocus<HTMLInputElement>()
  const [date, setDate] = useState(member.valid_until && member.valid_until >= today ? member.valid_until : '')
  const [tried, setTried] = useState(false)
  const save = useMutation({ mutationFn: () => membershipApi.validity(member.id, setBody(date, pressKey)), onSuccess: onDone })
  const failure = save.isError ? failureOf(save.error) : null
  const local = dateProblem(date, today)
  const code = tried ? local : failure?.code === 'invalid' ? 'past' : null
  const problem = code ? t(`loyalty.membership.validity.problem.${code}`, VALIDITY_PROBLEM_WORDS[code]) : null

  return (
    <Dialog title={t('loyalty.membership.validity.set_title', 'Valid until')} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (local === null) save.mutate()
      }}>
        <FormField label={t('loyalty.membership.validity.set_label', 'Last day of the membership')} problem={problem}
          hint={t('loyalty.membership.validity.set_hint', 'The member is let in on this day and refused from the day after.')}>
          <input ref={first} type="date" value={date} min={firstEndDay(today)} onChange={(e) => { setDate(e.target.value); save.reset() }} className={INPUT} />
        </FormField>
        {date && local === null && (
          <p className="text-sm text-a-text-2">{t('loyalty.membership.validity.set_preview', 'Valid until {{day}}.', { day: formatDate(date, locale, LONG) })}</p>
        )}
        {failure && failure.code !== 'invalid' && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'validity', failure))}</Notice>}
        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose} save={t('loyalty.membership.validity.set_save', 'Save the date')} />
      </form>
    </Dialog>
  )
}

/** Remove the end date: the membership then never ends. */
function RemoveDialog({ member, pressKey, onClose, onDone }: { member: Member; pressKey: string; onClose: () => void; onDone: (answer: ValidityAnswer) => void }) {
  const { t } = useTranslation()
  const save = useMutation({ mutationFn: () => membershipApi.validity(member.id, setBody(null, pressKey)), onSuccess: onDone })
  const failure = save.isError ? t(...refusalKey('loyalty.membership', ERRORS, 'validity', failureOf(save.error))) : null
  return (
    <ConfirmDialog title={t('loyalty.membership.validity.remove_title', 'Remove the end date?')}
      confirm={t('loyalty.membership.validity.remove_confirm', 'Remove the end date')} keep={t('loyalty.membership.validity.remove_keep', 'Keep it')}
      busy={save.isPending} failure={failure} onConfirm={() => save.mutate()} onClose={onClose}>
      <p>{t('loyalty.membership.validity.remove_body', 'The membership of {{name}} will never end, and places let them in by their tier alone.', { name: member.name })}</p>
    </ConfirmDialog>
  )
}
