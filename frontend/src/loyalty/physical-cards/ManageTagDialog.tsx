import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useFirstFocus } from '../lib/useFirstFocus'
import { afterCardChange } from '../scan/cardsApi'
import { CardError } from './CardDialogs'
import { CardTagInput } from './CardTagInput'
import { physicalCardsApi, physicalCardsKey, type RegisteredTag } from './api'
import { usePhysicalCardWords } from './words'

export function ManageTagDialog({ onClose }: { onClose: () => void }) {
  const say = usePhysicalCardWords()
  const input = useFirstFocus<HTMLInputElement>()
  const client = useQueryClient()
  const [uid, setUid] = useState('')
  const [confirm, setConfirm] = useState<RegisteredTag | null>(null)
  const lookup = useMutation({ mutationFn: physicalCardsApi.tagLookup })
  const release = useMutation({
    mutationFn: physicalCardsApi.releaseTag,
    onSuccess: (_result, card) => {
      setConfirm(null)
      if (card.member) afterCardChange(client, card.member.id)
      else void client.invalidateQueries({ queryKey: physicalCardsKey })
      lookup.mutate(uid.trim())
    },
  })
  const busy = lookup.isPending || release.isPending

  return <Dialog title={say('manageTag')} onClose={onClose} busy={release.isPending}>
    <div className="space-y-4">
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault()
        if (busy || confirm || !uid.trim()) return
        release.reset()
        lookup.mutate(uid.trim())
      }}>
        <p className="text-sm text-a-text-2">{say('manageTagHint')}</p>
        <CardTagInput inputRef={input} value={uid} disabled={busy || confirm !== null} onChange={value => {
          if (uid === value) return
          setUid(value)
          lookup.reset()
          release.reset()
        }} />
        <Button type="submit" loading={lookup.isPending} disabled={busy || confirm !== null || !uid.trim()}>{say('findTag')}</Button>
      </form>
      {lookup.isError && <CardError error={lookup.error} />}
      {release.isError && <CardError error={release.error} />}
      {release.isSuccess && <Notice tone="success">{say('tagReleased')}</Notice>}
      {lookup.data?.cards.length === 0 && !release.isSuccess && <Notice tone="info">{say('tagNotHere')}</Notice>}
      {lookup.data && lookup.data.cards.length > 0 && <ul className="divide-y divide-a-border rounded-xl border border-a-border">
        {lookup.data.cards.map(card => <li key={card.id} className="flex flex-wrap items-center gap-3 p-3">
          <div className="min-w-0 flex-1 text-sm text-a-text">
            <p className="font-semibold">{card.number ?? say('unnumberedCard')}</p>
            <p className="text-a-text-2">{card.member?.name ?? card.member?.number ?? say('status.unassigned')}</p>
          </div>
          <Button size="sm" variant="secondary" disabled={busy || confirm !== null} onClick={() => {
            release.reset()
            setConfirm(card)
          }}>{say('releaseTag')}</Button>
        </li>)}
      </ul>}
      {confirm && <div className="space-y-2">
        <Notice tone="warning">{say('confirmRelease')}</Notice>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={release.isPending} onClick={() => setConfirm(null)}>{say('cancel')}</Button>
          <Button loading={release.isPending} onClick={() => release.mutate(confirm)}>{say('releaseTagNow')}</Button>
        </div>
      </div>}
    </div>
  </Dialog>
}
