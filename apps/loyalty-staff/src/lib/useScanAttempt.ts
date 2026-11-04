import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { outcomeUncertain } from './attempts'
import { scanAttempts, scanCanRetry, scanScope, type ScanAttempt } from './scanAttempts'
import { useSession } from './session'
import { useBoot } from './queries'
import { useScan, type ScanWhere } from './scanState'
import { errorKey } from './desk'
import { failureOf } from './failure'
import type { Key } from './i18n'

export function useScanAttempt() {
  const user = useSession(s => s.user?.id)
  const tokenNow = useSession(s => s.token)
  const org = useBoot().data?.organization.id
  const scope = user && org ? scanScope(user, org) : null
  const [loaded, setLoaded] = useState<string | null>(null)
  const [pending, setPending] = useState<ScanAttempt | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Key | null>(null)
  const sending = useRef(false)
  useEffect(() => {
    let current = true
    if (scope) void scanAttempts.load(scope).then(attempt => {
      if (!current) return
      setProblem(null)
      setPending(attempt)
      if (attempt) useScan.getState().setWhere(attempt.where)
      setLoaded(scope)
    }).catch(() => { if (current) { setLoaded(null); setProblem('error.attempt_storage') } })
    return () => { current = false }
  }, [scope, tokenNow])

  const send = async (code: string, where: ScanWhere, retry = false) => {
    if (!scope || loaded !== scope || sending.current || (pending && !retry)) return
    const token = useSession.getState().token
    sending.current = true; setBusy(true); setProblem(null)
    let sent = false
    let attempt: ScanAttempt | null = null
    const wasPending = !!pending
    try {
      attempt = await scanAttempts.start(scope, code, where, Date.now())
      if (useSession.getState().token !== token) return
      setPending(attempt)
      useScan.getState().setWhere(attempt.where)
      if (!scanCanRetry(attempt, Date.now())) { setProblem('scan.retryExpired'); return }
      sent = true
      const answer = await api.scan({ code: attempt.code, idempotency_key: attempt.key,
        ...(attempt.where.kind === 'place' ? { place_id: attempt.where.id } : {}),
        ...(attempt.where.kind === 'event' ? { event_id: attempt.where.id } : {}),
      })
      await scanAttempts.finish(scope, attempt.key)
      if (useSession.getState().token !== token) return
      setPending(null)
      return answer
    } catch (error) {
      if (useSession.getState().token !== token) return
      // A refusal on a retry says nothing about the original attempt (e.g. a now-revoked QR).
      if (sent && !wasPending && !outcomeUncertain(error) && attempt) {
        try { await scanAttempts.finish(scope, attempt.key); setPending(null) }
        catch { setProblem('error.attempt_storage'); return }
      }
      setProblem(!sent ? 'error.attempt_storage' : wasPending || outcomeUncertain(error) ? 'scan.unconfirmed' : failureOf(error).code === 'not_found' ? 'scan.unknown' : errorKey(failureOf(error).code))
    } finally { sending.current = false; setBusy(false) }
  }
  const dismiss = async () => {
    if (!scope || !pending || sending.current) return
    const token = useSession.getState().token
    sending.current = true; setBusy(true)
    try {
      await scanAttempts.finish(scope, pending.key)
      if (useSession.getState().token === token) { setPending(null); setProblem(null) }
    } catch { if (useSession.getState().token === token) setProblem('error.attempt_storage') }
    finally { sending.current = false; setBusy(false) }
  }
  const ready = !!scope && loaded === scope
  return { ready, pending: ready ? pending : null, busy, problem, send, dismiss }
}
