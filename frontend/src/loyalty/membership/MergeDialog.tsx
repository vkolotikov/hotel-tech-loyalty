import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { memberPath } from '../lib/links'
import { useFirstFocus } from '../lib/useFirstFocus'
import { FormField } from '../ui/formParts'
import { afterMemberChange, duplicatesKey, membershipApi } from './api'
import { ERRORS } from './errors'
import { MERGE_MOVES, mergeProblems, mergeSides, pointsAfterMerge } from './membershipMath'
import type { DuplicatePair } from './types'
import { MERGE_MOVES_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Merge two members into one (spec 2026-10-21 release 2 §4.1, R2-3): which one is kept, everything of the other that
 * moves to it — the whole history, nothing left behind —, the points the kept member will have, and why (kept with the
 * merge's record). The merged member is gone afterwards; the kept member's page opens.
 */
export function MergeDialog({ pair, keepId, onClose }: { pair: DuplicatePair; keepId: number; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const navigate = useNavigate()
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const { keep, merge } = mergeSides(pair, keepId)
  const after = pointsAfterMerge(keep, merge)
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)

  const run = useMutation({
    mutationFn: () => membershipApi.merge({ keep_id: keep.id, merge_id: merge.id, reason: reason.trim() }),
    onSuccess: () => {
      afterMemberChange(client, keep.id)
      client.removeQueries({ queryKey: ['loyalty', 'member', merge.id] })
      onClose()
      navigate(memberPath(keep.id))
    },
    onError: (error) => {
      const code = failureOf(error).code
      if (code === 'not_found' || code === 'already_erased') void client.invalidateQueries({ queryKey: duplicatesKey })
    },
  })
  const problem = tried ? mergeProblems(reason).reason : undefined
  const failure = run.isError ? failureOf(run.error) : null

  return (
    <Dialog title={t('loyalty.membership.merge.title', 'Merge into {{name}}', { name: keep.name })} onClose={onClose} busy={run.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(mergeProblems(reason)).length === 0) run.mutate()
      }}>
        <p className="text-sm text-a-text">
          {t('loyalty.membership.merge.what', '{{merge}} ({{merge_number}}) is merged into {{keep}} ({{keep_number}}) and is then gone. Everything of theirs moves:', {
            merge: merge.name, merge_number: merge.member_number ?? '', keep: keep.name, keep_number: keep.member_number ?? '',
          })}
        </p>
        <ul data-moves="" className="list-disc space-y-1 pl-5 text-sm text-a-text">
          {MERGE_MOVES.map(item => <li key={item}>{t(`loyalty.membership.merge.moves.${item}`, MERGE_MOVES_WORDS[item])}</li>)}
        </ul>
        <p data-after="" className="text-sm text-a-text-2">
          {t('loyalty.membership.merge.after', '{{keep}} will have {{points}} points ({{lifetime}} earned in all).', {
            keep: keep.name, points: points(after.points, locale), lifetime: points(after.lifetime, locale),
          })}
        </p>
        <FormField label={t('loyalty.membership.merge.reason', 'Why they are one person')}
          problem={problem ? t('loyalty.membership.merge.problem.reason', 'Say why, in a few words.') : null}>
          <input ref={first} type="text" value={reason} maxLength={500} onChange={(e) => { setReason(e.target.value); if (run.isError) run.reset() }} className={INPUT}
            placeholder={t('loyalty.membership.merge.reason_example', 'e.g. Signed up twice, once with the phone')} />
        </FormField>
        <Notice tone="warning">{t('loyalty.membership.merge.final', 'This cannot be undone.')}</Notice>
        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'merge', failure))}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={run.isPending}>{t('loyalty.common.cancel', 'Cancel')}</Button>
          <Button type="submit" variant="danger" loading={run.isPending}>{t('loyalty.membership.merge.save', 'Merge')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
