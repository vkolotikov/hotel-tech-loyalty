import { useEffect } from 'react'
import { useLeaveGuard } from '../../earn/useLeaveGuard'
import { ConfirmDialog } from '../../ui/formParts'
import { useCampaignWords } from './words'

/** Protect channel drafts on workspace links and page unload, also while a write is pending. */
export function DraftProtection({ dirty, busy }: { dirty: boolean; busy: boolean }) {
  const leave = useLeaveGuard(), w = useCampaignWords()
  const { mark, begin, end } = leave
  useEffect(() => { mark('message', dirty) }, [dirty, mark])
  useEffect(() => { if (busy) begin(); else end() }, [busy, begin, end])
  return leave.destination ? <ConfirmDialog title={w('discardTitle')} confirm={w('discard')} keep={w('keep')} failure={null} busy={busy} onConfirm={leave.discard} onClose={leave.keep}><p>{w('discardBody')}</p></ConfirmDialog> : null
}
