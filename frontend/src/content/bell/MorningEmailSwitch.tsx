import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApi, useBoot } from '../ContentProvider'
import type { Bootstrap } from '../lib/types'
import { withMorningEmail } from './bellMath'

/**
 * The morning email switch (spec 2026-10-19 §4.5) at the foot of the bell's menu: each person's own, off until they
 * switch it on; at 8 am venue time an email lists the posts they post that day. The bootstrap is read again afterwards.
 */
export function MorningEmailSwitch() {
  const boot = useBoot()
  const api = useApi()
  const queryClient = useQueryClient()
  const [on, setOn] = useState(boot.staff.morning_email === true)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const flip = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      const answer = await api.setMorningEmail(!on)
      setOn(answer.on)
      queryClient.setQueriesData<Bootstrap>({ queryKey: ['content', 'bootstrap'] }, old => withMorningEmail(old, answer.on))
      void queryClient.invalidateQueries({ queryKey: ['content', 'bootstrap'] })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return <MorningSwitchView on={on} busy={busy} failed={failed} manager={boot.staff.can_manage} onFlip={() => { void flip() }} />
}

/**
 * The switch as drawn. While it saves it says so with `aria-disabled`, never `disabled`: a focused control that turns
 * disabled drops the focus, and the bell's menu closes on that blur (final review).
 */
export function MorningSwitchView({ on, busy, failed, manager = false, onFlip }: {
  on: boolean
  busy: boolean
  failed: boolean
  /** A manager's email also lists the posts nobody is set to post (5A-2 review). */
  manager?: boolean
  onFlip: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span id="content-morning-email" className="block text-sm font-medium text-a-text">{t('content.bell.morning', 'Morning email: today’s posts')}</span>
          <span id="content-morning-email-hint" className="block text-xs text-a-text-2">{manager
            ? t('content.bell.morning_hint_manager', 'At 8 am, the posts you post today and those nobody is set to post.')
            : t('content.bell.morning_hint', 'At 8 am, the posts you post today.')}</span>
        </span>
        <button type="button" role="switch" aria-checked={on} aria-disabled={busy || undefined} aria-labelledby="content-morning-email" aria-describedby="content-morning-email-hint"
          onMouseDown={(e) => e.preventDefault()} onClick={() => { if (!busy) onFlip() }}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-a-accent' : 'bg-a-surface-2'} ${busy ? 'opacity-60' : ''}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-a-surface shadow-a-sm transition ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
        </button>
      </div>
      {failed && <p role="status" className="mt-1 text-xs text-a-danger">{t('content.bell.morning_failed', 'The setting could not be saved. Please try again.')}</p>}
    </div>
  )
}
