import { useEffect, useRef, useState } from 'react'
import { usePreventRemove } from 'expo-router'
import { useSession } from './session'
import { useBoot } from './queries'
import { attemptScope, deskAttempts, outcomeUncertain, type DeskAttempt } from './attempts'
import { failureOf } from './failure'
import { errorKey } from './desk'
import { api, type AttemptStatus } from './api'
import type { Key } from './i18n/en'

/** The exact unanswered payload is restored before another transaction can be sent. */
export function useDeskAttempt(member: number, action: 'award' | 'redeem' | 'checkin', restore: (attempt: DeskAttempt) => void) {
  const user = useSession(s => s.user?.id)
  const org = useBoot().data?.organization.id
  const scope = user && org && member > 0 ? attemptScope(user, org, member, action) : null
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Key | null>(null)
  const [receipt, setReceipt] = useState<Extract<AttemptStatus, { state: 'recorded' }> | null>(null)
  const sending = useRef(false)
  const resume = useRef<DeskAttempt | null>(null)
  const tokenNow = useSession(s => s.token)
  usePreventRemove(busy && !!tokenNow)
  const restoreRef = useRef(restore)
  useEffect(() => { restoreRef.current = restore }, [restore])
  useEffect(() => {
    let current = true
    resume.current = null
    if (scope) void deskAttempts.load(scope).then(attempt => {
      if (!current) return
      setFailure(null)
      setReceipt(null)
      setPending(!!attempt)
      if (attempt) { resume.current = attempt; restoreRef.current(attempt) }
      setLoadedScope(scope)
    }).catch(() => { if (current) { setLoadedScope(null); setFailure('error.attempt_storage') } })
    return () => { current = false }
  }, [scope])

  const send = async <T,>(amount: number | null, note: string, write: (attempt: DeskAttempt) => Promise<T>): Promise<T | undefined> => {
    if (!scope || loadedScope !== scope || sending.current) return
    sending.current = true
    setBusy(true)
    setFailure(null)
    const token = useSession.getState().token
    let sent = false
    const wasPending = pending
    try {
      const attempt = await deskAttempts.start(scope, amount, note, resume.current)
      resume.current = attempt
      if (useSession.getState().token !== token) return
      restoreRef.current(attempt)
      sent = true
      const result = await write(attempt)
      // Persisted cleanup failure is also safe: retry keeps the same key.
      await deskAttempts.finish(scope)
      if (useSession.getState().token !== token) return
      setPending(false)
      resume.current = null
      return result
    } catch (error) {
      if (useSession.getState().token !== token) return
      const uncertain = sent && (wasPending || outcomeUncertain(error))
      if (sent && !uncertain) {
        try { await deskAttempts.finish(scope) } catch { setPending(true); setFailure('error.attempt_storage'); return }
        resume.current = null
      }
      setPending(uncertain)
      setFailure(!sent ? 'error.attempt_storage' : uncertain ? 'error.unconfirmed' : errorKey(failureOf(error).code))
      return
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  /** This can still resolve a committed write after the operator loses permission to repeat it. */
  const check = async () => {
    if (!scope || loadedScope !== scope || !resume.current || sending.current) return
    const token = useSession.getState().token
    sending.current = true
    setBusy(true)
    setFailure(null)
    try {
      const result = await api.attemptStatus(member, action, resume.current)
      if (useSession.getState().token !== token) return
      if (result.state === 'unknown') { setFailure('recovery.unknown'); return }
      await deskAttempts.finish(scope)
      if (useSession.getState().token !== token) return
      resume.current = null
      setPending(false)
      setReceipt(result)
    } catch {
      if (useSession.getState().token === token) setFailure('recovery.checkFailed')
    } finally { sending.current = false; setBusy(false) }
  }
  const ready = !!scope && loadedScope === scope
  return { ready, pending: ready && pending, busy, failure, receipt: ready ? receipt : null, send, check }
}
