import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarCheck, CalendarClock, CalendarDays, CalendarOff, CalendarPlus, CalendarX2, Infinity as Endless, type LucideIcon } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { refusalKey } from '../lib/errors'
import type { MemberRow } from '../lib/types'
import { useFirstFocus } from '../lib/useFirstFocus'
import { ConfirmDialog, FormField, FormFoot } from '../ui/formParts'
import { CARD, CardHead } from '../member/CardHead'
import { afterMemberChange, membershipApi } from './api'
import { ERRORS } from './errors'
import type { ValidityAnswer } from './types'
import {
  EXTENSIONS, dateProblem, extendBody, extendedEnd, firstEndDay, headlineOf, leftText, renewsKey, setBody, stateTone, validityActions,
  type Extension, type MembershipState, type Say, type ValidityHeadline,
} from './validityMath'
import { EXTEND_WORDS, VALIDITY_PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'
const LONG: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

type Member = MemberRow & { is_erased?: boolean }

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
    onError: (error) => refused(error),
  })
  // A refusal the server answered (key_reused after a lost answer and another choice, a past date…) wrote nothing: the
  // next press takes a new key, and the member is read again so the card shows the end date as it is. A lost answer
  // keeps its key, so pressing the same choice again is answered as the first press (written once).
  const refused = (error: unknown) => {
    if (!renewsKey(failureOf(error))) return
    setKey(newPressKey())
    afterMemberChange(client, member.id)
  }
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

  const tone = headline.kind === 'none' ? 'fulfilled' : stateTone(state)
  const Icon = HEADLINE_ICONS[headline.kind]
  const detail = detailText(headline, say, day)

  return (
    <section aria-labelledby={titleId} data-validity={headline.kind} className={CARD}>
      <CardHead id={titleId} icon={CalendarClock} title={t('loyalty.membership.validity.title', 'Membership')} />

      {/* One line of status: the state's colour and icon on the headline, the time left (or what follows) beside it. */}
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span data-state={tone} data-validity-line="" className="l-st-tint l-st-text inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold">
            <Icon size={15} aria-hidden className="shrink-0" />{headlineText(headline, say, day)}
          </span>
          {headline.kind === 'active' && detail && <span className="text-sm text-a-text-2">{detail}</span>}
        </p>
        {headline.kind !== 'active' && detail && <p className="text-sm text-a-text-2">{detail}</p>}
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

      {change && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" aria-expanded={choosing} aria-controls={choicesId} onClick={() => { setChoosing(c => !c); extend.reset() }}>
              <CalendarPlus size={15} aria-hidden />{t('loyalty.membership.validity.extend_action', 'Extend')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setDone(null); setDialog('set') }}>
              <CalendarDays size={15} aria-hidden />{t('loyalty.membership.validity.set', 'Set a date')}
            </Button>
            {shown.valid_until && (
              <button type="button" onClick={() => { setDone(null); setDialog('remove') }}
                className="rounded-full py-2 text-xs font-medium text-a-text-2 underline-offset-2 hover:text-a-text hover:underline">
                {t('loyalty.membership.validity.remove', 'Remove the end date')}
              </button>
            )}
          </div>
          {choosing && (
            <ul id={choicesId} role="group" aria-label={t('loyalty.membership.validity.extend_by', 'Extend by')} className="grid grid-cols-2 gap-2">
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
          )}
        </div>
      )}

      {dialog === 'set' && (
        <SetDateDialog member={shown} today={today} pressKey={key} onClose={() => setDialog(null)} onDone={finish} onRefused={refused} />
      )}
      {dialog === 'remove' && (
        <RemoveDialog member={shown} pressKey={key} onClose={() => setDialog(null)} onDone={finish} onRefused={refused} />
      )}
    </section>
  )
}

/** The headline's icon, by what it says. */
const HEADLINE_ICONS: Record<ValidityHeadline['kind'], LucideIcon> = {
  none: Endless, active: CalendarCheck, expiring: CalendarClock, expired: CalendarX2, off: CalendarOff,
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

/** The words beside or under it: the time left, or what happens now (none for a membership without an end). */
function detailText(h: ValidityHeadline, say: Say, day: (d: string) => string): string | null {
  switch (h.kind) {
    case 'none':
      return null
    case 'active':
      return say('loyalty.membership.validity.left_line', '{{left}} left.', { left: leftText(h.left, say) })
    case 'expiring':
      return say('loyalty.membership.validity.expiring_line', 'Valid until {{day}}. After it, places refuse entry until it is renewed.', { day: day(h.until) })
    case 'expired':
      return say('loyalty.membership.validity.expired_line', 'Places refuse entry until it is renewed.')
    case 'off':
      return say('loyalty.membership.validity.off_line', 'Places refuse entry whatever the date.')
  }
}

/** Set a date: the last day the membership holds, today or later. */
function SetDateDialog({ member, today, pressKey, onClose, onDone, onRefused }: {
  member: Member; today: string; pressKey: string; onClose: () => void; onDone: (answer: ValidityAnswer) => void; onRefused: (error: unknown) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const first = useFirstFocus<HTMLInputElement>()
  const [date, setDate] = useState(member.valid_until && member.valid_until >= today ? member.valid_until : '')
  const [tried, setTried] = useState(false)
  const save = useMutation({ mutationFn: () => membershipApi.validity(member.id, setBody(date, pressKey)), onSuccess: onDone, onError: onRefused })
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
function RemoveDialog({ member, pressKey, onClose, onDone, onRefused }: {
  member: Member; pressKey: string; onClose: () => void; onDone: (answer: ValidityAnswer) => void; onRefused: (error: unknown) => void
}) {
  const { t } = useTranslation()
  const save = useMutation({ mutationFn: () => membershipApi.validity(member.id, setBody(null, pressKey)), onSuccess: onDone, onError: onRefused })
  const failure = save.isError ? t(...refusalKey('loyalty.membership', ERRORS, 'validity', failureOf(save.error))) : null
  return (
    <ConfirmDialog title={t('loyalty.membership.validity.remove_title', 'Remove the end date?')}
      confirm={t('loyalty.membership.validity.remove_confirm', 'Remove the end date')} keep={t('loyalty.membership.validity.remove_keep', 'Keep it')}
      busy={save.isPending} failure={failure} onConfirm={() => save.mutate()} onClose={onClose}>
      <p>{t('loyalty.membership.validity.remove_body', 'The membership of {{name}} will never end, and places let them in by their tier alone.', { name: member.name })}</p>
    </ConfirmDialog>
  )
}
