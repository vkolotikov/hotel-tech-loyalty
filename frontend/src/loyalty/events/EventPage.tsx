import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Ban, CalendarDays, ClipboardList, DoorOpen, Footprints, MapPin, Maximize2, MoreHorizontal, Pencil, ScanLine, Send, Sparkles, Ticket, Trash2, UserCheck, UserPlus, Users, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { SideMenu } from '../../workspace/shell/SideMenu'
import { venueNow } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { useLook } from '../lib/look'
import type { MemberRow } from '../lib/types'
import { useFirstFocus } from '../lib/useFirstFocus'
import { ConfirmDialog, ToneBadge } from '../ui/formParts'
import { Pager } from '../ui/Pager'
import { TierChip } from '../ui/TierChip'
import { ERRORS } from './errors'
import { EventDialog } from './EventDialog'
import { MemberPicker } from './MemberPicker'
import { afterEventChange, afterPersonChange, eventKey, eventsApi, peopleKey } from './eventsApi'
import {
  SCAN_CONTEXT_KEY, checkInSentence, counted, doorPathFor, eventActions, moreItems, peopleGroups, personLine, personState, phaseTone, scanContextFor, scanPathFor, wallNow, whenLine, whereOf,
  type CheckInSaid, type MoreItem, type Say,
} from './eventsMath'
import type { CheckInAnswer, EventOptions, EventPerson, LoyaltyEventRow } from './types'
import { PHASE_WORDS } from './words'

/**
 * One event (release 8, spec 2026-10-25 §4): its numbers, Start check-in (Scan with this event chosen) and Door mode
 * (the full-screen scanner for the entrance), Check in by name, the people — signed up, checked in, walk-ins, with their times — Add a member, and for those who may change
 * events: Edit, Publish, Cancel event (saying what the members signed up will be told) and Delete draft.
 */
export function EventPage() {
  const { t } = useTranslation()
  const params = useParams()
  const id = Number(params.id)
  const one = useQuery({ queryKey: eventKey(id), queryFn: () => eventsApi.one(id), enabled: Number.isInteger(id) && id > 0 })

  if (one.isError && !one.data) {
    return (
      <div className="space-y-4 px-4 py-6 lg:px-6">
        <BackLink />
        <div className="max-w-xl space-y-3">
          <Notice tone="danger">{t(...refusalKey('loyalty.events', ERRORS, 'load', failureOf(one.error)))}</Notice>
          <Button variant="secondary" onClick={() => { void one.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>
        </div>
      </div>
    )
  }
  if (!one.data) {
    return (
      <div role="status" className="space-y-4 px-4 py-6 lg:px-6">
        <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  return <EventView event={one.data.event} canChange={one.data.can_change} options={one.data.options} />
}

function BackLink() {
  const { t } = useTranslation()
  return (
    <Link to="/loyalty/events" className="inline-flex items-center gap-1.5 text-sm text-a-text-2 hover:text-a-text">
      <ArrowLeft size={15} aria-hidden />{t('loyalty.events.page.back', 'Events')}
    </Link>
  )
}

type Open = null | 'edit' | 'add' | 'cancel' | 'delete'

/** The event's page once it has loaded. */
export function EventView({ event, canChange, options }: { event: LoyaltyEventRow; canChange: boolean; options: EventOptions }) {
  const { t, i18n } = useTranslation()
  const say: Say = (key, fallback, vars) => t(key, fallback, vars ?? {})
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const look = useLook()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [open, setOpen] = useState<Open>(null)
  const [byName, setByName] = useState(false)
  const [said, setSaid] = useState<CheckInSaid | null>(null)
  const [page, setPage] = useState(1)
  const now = wallNow(venueNow(boot.venue.timezone))
  const can = eventActions(event, canChange, now)
  const where = whereOf(event)

  const people = useQuery({ queryKey: [...peopleKey(event.id), page], queryFn: () => eventsApi.people(event.id, page) })
  const checkIn = useMutation({
    mutationFn: (member: { id: number; name: string }) => eventsApi.checkIn(event.id, member.id, newPressKey()),
    onSuccess: (answer: CheckInAnswer, member) => {
      setSaid(checkInSentence(answer, member.name, say, locale))
      afterPersonChange(client, event.id, member.id)
    },
  })
  const cancelSignUp = useMutation({
    mutationFn: (memberId: number) => eventsApi.cancelSignUp(event.id, memberId),
    onSuccess: (_, memberId) => afterPersonChange(client, event.id, memberId),
  })
  const publish = useMutation({ mutationFn: () => eventsApi.publish(event.id), onSuccess: () => afterEventChange(client, event.id) })
  const lifeFailure = publish.isError ? failureOf(publish.error) : cancelSignUp.isError ? failureOf(cancelSignUp.error) : null

  /** Scan remembers this event as its choice on this device; the address carries it too, for when storage is blocked. */
  const remember = () => {
    try {
      window.localStorage.setItem(SCAN_CONTEXT_KEY, scanContextFor(event.id))
    } catch {
      // Storage refused (a private window): the address still carries the event.
    }
  }
  const startCheckIn = () => {
    remember()
    navigate(scanPathFor(event.id))
  }

  const c = event.counts
  const tiles: { key: string; icon: LucideIcon; label: string; value: number }[] = [
    ...(event.sign_up ? [{ key: 'signed_up', icon: ClipboardList, label: t('loyalty.events.page.signed_up', 'Signed up'), value: c.signed_up }] : []),
    { key: 'checked_in', icon: UserCheck, label: t('loyalty.events.page.checked_in', 'Checked in'), value: c.checked_in },
    ...(event.sign_up ? [{ key: 'walk_ins', icon: DoorOpen, label: t('loyalty.events.page.walk_ins', 'Walk-ins'), value: c.walk_ins }] : []),
    ...(c.room_left !== null ? [{ key: 'room_left', icon: Ticket, label: t('loyalty.events.page.room_left', 'Places left'), value: c.room_left }] : []),
  ]
  const more = moreItems(can)
  const pick = (item: MoreItem) => setOpen(item === 'add' ? 'add' : item === 'edit' ? 'edit' : item === 'cancel' ? 'cancel' : 'delete')

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <BackLink />

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className={`font-a-display text-[34px] font-normal leading-tight text-a-text ${event.phase === 'cancelled' ? 'line-through decoration-a-text-2/50' : ''}`}>{event.title}</h1>
          <ToneBadge tone={phaseTone(event.phase)}>{t(`loyalty.events.phase.${event.phase}`, PHASE_WORDS[event.phase])}</ToneBadge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-a-text-2">
          <span className="inline-flex items-center gap-1.5 text-a-text"><CalendarDays size={15} aria-hidden className="text-a-text-2" />{whenLine(event.starts_at, event.ends_at, locale)}</span>
          {where && <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden />{where}</span>}
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {event.admits === 'tiers'
              ? event.tiers.map(tier => <TierChip key={tier.id} tier={tier} theme={look.resolved} size="sm" />)
              : <><Users size={15} aria-hidden />{t('loyalty.events.card.every_member', 'Every member')}</>}
          </span>
          {event.points > 0 && <span className="inline-flex items-center gap-1.5 font-semibold text-a-accent-text"><Sparkles size={15} aria-hidden />{counted(say, 'points_plus', event.points, locale)}</span>}
          {event.counts_as_visit && <span className="inline-flex items-center gap-1.5"><Footprints size={15} aria-hidden />{t('loyalty.events.card.visit', 'Counts as a visit')}</span>}
        </div>
        {event.description && <p className="max-w-2xl whitespace-pre-line text-sm text-a-text">{event.description}</p>}

        {/* Start check-in (or Publish, for a draft) is the page's action; Door mode and by name sit beside it; the rest is under More. */}
        <div className="flex flex-wrap items-center gap-2">
          {can.checkIn && <Button onClick={startCheckIn}><ScanLine size={16} aria-hidden />{t('loyalty.events.page.start_check_in', 'Start check-in')}</Button>}
          {can.publish && <Button loading={publish.isPending} onClick={() => publish.mutate()}><Send size={16} aria-hidden />{t('loyalty.events.page.publish', 'Publish')}</Button>}
          {can.checkIn && (
            <Link to={doorPathFor(event.id)} onClick={remember} title={t('loyalty.events.page.door_mode', 'Door mode')}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-a-border bg-a-surface px-3 text-sm font-semibold text-a-text hover:bg-a-surface-2 sm:px-4">
              <Maximize2 size={16} aria-hidden /><span className="sr-only sm:not-sr-only">{t('loyalty.events.page.door_mode', 'Door mode')}</span>
            </Link>
          )}
          {can.checkIn && (
            <button type="button" aria-expanded={byName} title={t('loyalty.events.page.by_name', 'Check in by name')} onClick={() => { setByName(v => !v); setSaid(null) }}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border px-3 text-sm font-semibold sm:px-4 ${byName ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border bg-a-surface text-a-text hover:bg-a-surface-2'}`}>
              <UserCheck size={16} aria-hidden /><span className="sr-only sm:not-sr-only">{t('loyalty.events.page.by_name', 'Check in by name')}</span>
            </button>
          )}
          {more.length > 0 && (
            <div data-event-more="">
              <SideMenu kind="menu" place="down-right" label={t('loyalty.events.page.more', 'More')} named
                buttonClassName="inline-flex h-11 w-11 items-center justify-center rounded-full border border-a-border bg-a-surface text-a-text hover:bg-a-surface-2"
                face={<MoreHorizontal size={18} aria-hidden />} listClassName="w-56">
                {more.map(item => <MoreRow key={item} item={item} onPick={pick} />)}
              </SideMenu>
            </div>
          )}
        </div>
        {lifeFailure && <Notice tone="danger">{t(...refusalKey('loyalty.events', ERRORS, publish.isError ? 'life' : 'people', lifeFailure))}</Notice>}
        {event.status === 'draft' && <p className="text-xs text-a-text-2">{t('loyalty.events.page.draft_note', 'A draft: members do not see it, and nobody can sign up or check in until you publish it.')}</p>}
      </header>

      <dl className={`grid overflow-hidden rounded-2xl border border-a-border bg-a-surface ${tiles.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} ${tiles.length >= 4 ? 'sm:grid-cols-4' : tiles.length === 3 ? 'sm:grid-cols-3' : ''}`}>
        {tiles.map(tile => (
          <div key={tile.key} data-tile={tile.key} className="flex items-center gap-3 border-a-border px-4 py-3 [&:not(:first-child)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
            <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-a-accent/10 text-a-accent-text"><tile.icon size={16} /></span>
            <div className="min-w-0">
              <dt className="truncate text-xs font-medium text-a-text-2">{tile.label}</dt>
              <dd className="font-a-display text-2xl leading-tight tabular-nums text-a-text">{points(tile.value, locale)}</dd>
            </div>
          </div>
        ))}
      </dl>

      {byName && can.checkIn && (
        <section aria-label={t('loyalty.events.page.by_name', 'Check in by name')} className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-4">
          <ByName pending={checkIn.isPending} onCheckIn={(m) => { setSaid(null); checkIn.mutate({ id: m.id, name: m.name }) }} />
          {checkIn.isError && <Notice tone="danger">{t(...refusalKey('loyalty.events', ERRORS, 'check_in', failureOf(checkIn.error)))}</Notice>}
        </section>
      )}
      <div aria-live="polite">
        {said && (
          <Notice tone={said.tone === 'success' ? 'success' : said.tone === 'danger' ? 'danger' : 'info'}>
            <span className="font-medium">{said.text}</span>{said.points && <> · {said.points}</>}
          </Notice>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-a-text">{t('loyalty.events.page.people', 'People')}</h2>
        {people.isError && !people.data && <Notice tone="danger">{t(...refusalKey('loyalty.events', ERRORS, 'load', failureOf(people.error)))}</Notice>}
        {!people.data && people.isLoading && <Skeleton className="h-32 rounded-2xl" />}
        {people.data && people.data.people.length === 0 && (
          <p className="rounded-2xl border border-dashed border-a-border px-4 py-8 text-center text-sm text-a-text-2">
            {event.sign_up
              ? t('loyalty.events.page.nobody_signed_up', 'Nobody has signed up yet. Members sign up in the portal, or add them here.')
              : t('loyalty.events.page.nobody_in', 'Nobody has checked in yet. Start check-in when the doors open.')}
          </p>
        )}
        {people.data && people.data.people.length > 0 && (
          <PeopleList people={people.data.people} signUp={event.sign_up} canAct={can.cancelSignUp} pending={checkIn.isPending || cancelSignUp.isPending}
            onCheckIn={(p) => { setSaid(null); checkIn.mutate({ id: p.member.id, name: p.member.name }) }}
            onCancel={(p) => cancelSignUp.mutate(p.member.id)} />
        )}
        {people.data && <Pager page={people.data.page} pages={people.data.pages} onPage={setPage} />}
      </section>

      {open === 'edit' && <EventDialog event={event} options={options} onClose={() => setOpen(null)} />}
      {open === 'add' && <AddMemberDialog event={event} onClose={() => setOpen(null)} />}
      {open === 'cancel' && <CancelEventDialog event={event} onClose={() => setOpen(null)} />}
      {open === 'delete' && <DeleteDraftDialog event={event} onClose={() => setOpen(null)} onDeleted={() => navigate('/loyalty/events?tab=drafts')} />}
    </div>
  )
}

const MORE_ROW = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-a-surface-2 focus:bg-a-surface-2 focus:outline-none'

/** One row of the More menu: Add a member, Edit, and the ones that end something (in the danger colour, last). */
function MoreRow({ item, onPick }: { item: MoreItem; onPick: (item: MoreItem) => void }) {
  const { t } = useTranslation()
  const rows: Record<MoreItem, { icon: LucideIcon; word: string; danger?: boolean }> = {
    add: { icon: UserPlus, word: t('loyalty.events.page.add_member', 'Add a member') },
    edit: { icon: Pencil, word: t('loyalty.events.page.edit', 'Edit') },
    cancel: { icon: Ban, word: t('loyalty.events.page.cancel_event', 'Cancel event'), danger: true },
    delete: { icon: Trash2, word: t('loyalty.events.page.delete', 'Delete draft'), danger: true },
  }
  const row = rows[item]
  return (
    <button type="button" role="menuitem" data-more={item} onClick={() => onPick(item)} className={`${MORE_ROW} ${row.danger ? 'text-a-danger' : 'text-a-text'}`}>
      <row.icon size={15} aria-hidden />{row.word}
    </button>
  )
}

/** Check in by name: find the member, press Check in. */
function ByName({ pending, onCheckIn }: { pending: boolean; onCheckIn: (member: MemberRow) => void }) {
  const { t } = useTranslation()
  const first = useFirstFocus<HTMLInputElement>()
  return (
    <MemberPicker label={t('loyalty.events.page.find_member', 'Find the member')} inputRef={first}
      action={(member) => (
        <Button size="sm" disabled={pending} onClick={() => onCheckIn(member)}>
          {t('loyalty.events.page.check_in', 'Check in')}<span className="sr-only"> {member.name}</span>
        </Button>
      )} />
  )
}

/** The people in their groups: signed up (with their check-in time once in), walk-ins, cancelled. */
function PeopleList({ people, signUp, canAct, pending, onCheckIn, onCancel }: {
  people: EventPerson[]
  signUp: boolean
  canAct: boolean
  pending: boolean
  onCheckIn: (p: EventPerson) => void
  onCancel: (p: EventPerson) => void
}) {
  const { t } = useTranslation()
  const say: Say = (key, fallback, vars) => t(key, fallback, vars ?? {})
  const look = useLook()
  const groups = useMemo(() => peopleGroups(people, signUp), [people, signUp])
  const sections: { key: string; title: string; list: EventPerson[] }[] = [
    { key: 'signed_up', title: t('loyalty.events.page.group_signed_up', 'Signed up'), list: groups.signedUp },
    { key: 'walk_ins', title: signUp ? t('loyalty.events.page.group_walk_ins', 'Walk-ins') : t('loyalty.events.page.group_in', 'Checked in'), list: groups.walkIns },
    { key: 'cancelled', title: t('loyalty.events.page.group_cancelled', 'Cancelled'), list: groups.cancelled },
  ].filter(s => s.list.length > 0)

  return (
    <div className="space-y-4">
      {sections.map(section => (
        <div key={section.key} className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-a-text-2">{section.title}</h3>
          <ul className="divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface">
            {section.list.map(p => {
              const state = personState(p, signUp)
              return (
                <li key={p.member.id} data-person={state} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link to={`/loyalty/members/${p.member.id}`} className="text-sm font-medium text-a-text hover:text-a-accent-text">{p.member.name}</Link>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-a-text-2">
                      {p.member.member_number && <span className="font-a-mono">{p.member.member_number}</span>}
                      <TierChip tier={p.member.tier} theme={look.resolved} size="sm" />
                    </p>
                  </div>
                  <span className={`text-xs font-medium ${state === 'in' || state === 'walk_in' ? 'text-a-st-confirmed' : 'text-a-text-2'}`}>{personLine(p, say, signUp)}</span>
                  {canAct && state === 'signed_up' && (
                    <span className="flex gap-1.5">
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => onCheckIn(p)}>
                        {t('loyalty.events.page.check_in', 'Check in')}<span className="sr-only"> {p.member.name}</span>
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => onCancel(p)}>
                        {t('loyalty.events.page.cancel_sign_up', 'Cancel sign-up')}<span className="sr-only"> {p.member.name}</span>
                      </Button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** Add a member: find them and sign them up (by staff). */
function AddMemberDialog({ event, onClose }: { event: LoyaltyEventRow; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const [added, setAdded] = useState<string[]>([])
  const signUp = useMutation({
    mutationFn: (member: MemberRow) => eventsApi.signUp(event.id, member.id, newPressKey()),
    onSuccess: (_, member) => {
      setAdded(list => [...list, member.name])
      afterPersonChange(client, event.id, member.id)
    },
  })
  return (
    <Dialog title={t('loyalty.events.add.title', 'Add a member to {{title}}', { title: event.title })} onClose={onClose} busy={signUp.isPending}>
      <div className="space-y-4">
        <MemberPicker label={t('loyalty.events.page.find_member', 'Find the member')} inputRef={first}
          action={(member) => (
            <Button size="sm" disabled={signUp.isPending} onClick={() => signUp.mutate(member)}>
              {t('loyalty.events.add.sign_up', 'Sign up')}<span className="sr-only"> {member.name}</span>
            </Button>
          )} />
        <div aria-live="polite" className="space-y-2">
          {added.length > 0 && <Notice tone="success">{t('loyalty.events.add.done', 'Signed up: {{names}}', { names: added.join(', ') })}</Notice>}
          {signUp.isError && <Notice tone="danger">{t(...refusalKey('loyalty.events', ERRORS, 'people', failureOf(signUp.error)))}</Notice>}
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>{t('loyalty.events.add.close', 'Done')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Cancel the event: what happens, what the members signed up are told, an optional line for them. */
function CancelEventDialog({ event, onClose }: { event: LoyaltyEventRow; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const say: Say = (key, fallback, vars) => t(key, fallback, vars ?? {})
  const client = useQueryClient()
  const [reason, setReason] = useState('')
  const cancel = useMutation({
    mutationFn: () => eventsApi.cancel(event.id, reason.trim() || null),
    onSuccess: () => { afterEventChange(client, event.id); onClose() },
  })
  const n = event.counts.signed_up
  return (
    <ConfirmDialog title={t('loyalty.events.cancel.title', 'Cancel {{title}}?', { title: event.title })}
      confirm={t('loyalty.events.cancel.confirm', 'Cancel the event')} keep={t('loyalty.events.cancel.keep', 'Keep it')}
      busy={cancel.isPending} failure={cancel.isError ? t(...refusalKey('loyalty.events', ERRORS, 'life', failureOf(cancel.error))) : null}
      onConfirm={() => cancel.mutate()} onClose={onClose}>
      <p>{t('loyalty.events.cancel.effect', 'Members no longer see it in the portal and nobody can check in. Sign-ups and check-ins stay on the event’s page.')}</p>
      {n > 0
        ? <p>{t('loyalty.events.cancel.told', 'An inbox message and a push go to the members signed up ({{members}}): “{{title}} is cancelled”.', { members: counted(say, 'members', n, i18n.language || 'en'), title: event.title })}</p>
        : <p>{t('loyalty.events.cancel.nobody', 'Nobody has signed up, so nobody is told.')}</p>}
      {n > 0 && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('loyalty.events.cancel.reason', 'A line for them (optional)')}</span>
          <textarea value={reason} rows={2} maxLength={300} onChange={(e) => setReason(e.target.value)}
            placeholder={t('loyalty.events.cancel.reason_example', 'e.g. The forecast is storms; we will set a new date soon.')}
            className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" />
        </label>
      )}
    </ConfirmDialog>
  )
}

/** Delete a draft: it goes, nothing else changes. */
function DeleteDraftDialog({ event, onClose, onDeleted }: { event: LoyaltyEventRow; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: () => eventsApi.remove(event.id),
    onSuccess: () => { afterEventChange(client); onClose(); onDeleted() },
  })
  return (
    <ConfirmDialog title={t('loyalty.events.delete.title', 'Delete the draft {{title}}?', { title: event.title })}
      confirm={t('loyalty.events.delete.confirm', 'Delete draft')} keep={t('loyalty.events.delete.keep', 'Keep it')}
      busy={remove.isPending} failure={remove.isError ? t(...refusalKey('loyalty.events', ERRORS, 'life', failureOf(remove.error))) : null}
      onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{t('loyalty.events.delete.effect', 'Members never saw it. This cannot be undone.')}</p>
    </ConfirmDialog>
  )
}
