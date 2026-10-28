import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Ban, Pencil, Trash2, UserPlus, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, newPressKey } from '../lib/api'
import { refusalKey } from '../lib/errors'
import type { MemberRow } from '../lib/types'
import { useFirstFocus } from '../lib/useFirstFocus'
import { ConfirmDialog } from '../ui/formParts'
import { ERRORS } from './errors'
import { MemberPicker } from './MemberPicker'
import { afterEventChange, afterPersonChange, eventsApi } from './eventsApi'
import { counted, type MoreItem, type Say } from './eventsMath'
import type { LoyaltyEventRow } from './types'
const MORE_ROW = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-a-surface-2 focus:bg-a-surface-2 focus:outline-none'

/** One row of the More menu: Add a member, Edit, and the ones that end something (in the danger colour, last). */
export function MoreRow({ item, onPick }: { item: MoreItem; onPick: (item: MoreItem) => void }) {
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
export function ByName({ pending, onCheckIn }: { pending: boolean; onCheckIn: (member: MemberRow) => void }) {
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

export function AddMemberDialog({ event, onClose }: { event: LoyaltyEventRow; onClose: () => void }) {
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
export function CancelEventDialog({ event, onClose }: { event: LoyaltyEventRow; onClose: () => void }) {
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
export function DeleteDraftDialog({ event, onClose, onDeleted }: { event: LoyaltyEventRow; onClose: () => void; onDeleted: () => void }) {
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
