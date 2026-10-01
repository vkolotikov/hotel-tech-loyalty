import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Impact } from '../lib/types'
import { formatDate } from '../lib/wallClock'
import { Button } from '../ui/Button'

/**
 * "These appointments fall outside this change" (owner decision: warn, list,
 * still allow). Each one opens on its own day in the calendar; nothing is
 * moved, cancelled or messaged by saving.
 */
export function ConflictDialog({ impact, locale, onConfirm, onCancel }: { impact: Impact; locale: string; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const rest = impact.total - impact.affected.length

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-a-text/40 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="setup-conflict-title" aria-describedby="setup-conflict-intro"
        className="w-full max-w-lg space-y-4 rounded-xl border border-a-border bg-a-surface p-5 shadow-xl">
        <h2 id="setup-conflict-title" className="text-base font-semibold text-a-text">
          {t('appointments.setup.conflict.title', 'Appointments affected: {{count}}', { count: impact.total })}
        </h2>
        <p id="setup-conflict-intro" className="text-sm text-a-text-2">
          {t('appointments.setup.conflict.intro', 'These appointments fall outside this change. They stay booked: move or cancel them from the calendar if needed. Nobody is messaged.')}
        </p>
        <ul className="max-h-72 divide-y divide-a-border overflow-y-auto rounded-lg border border-a-border">
          {impact.affected.map(a => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-medium text-a-text">{formatDate(a.start.slice(0, 10), locale)} · {a.start.slice(11, 16)}</span>
                <span className="block truncate text-xs text-a-text-2">{[a.client, a.service, a.team_member].filter(Boolean).join(' · ')}</span>
              </span>
              <Link to={`/appointments?open=${a.id}&date=${a.start.slice(0, 10)}`} className="shrink-0 text-sm font-semibold text-a-accent-deep">
                {t('appointments.setup.conflict.open', 'Open')}
              </Link>
            </li>
          ))}
        </ul>
        {rest > 0 && <p className="text-xs text-a-text-2">{t('appointments.setup.conflict.more', '…and {{count}} more.', { count: rest })}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} autoFocus>{t('appointments.setup.conflict.back', 'Back')}</Button>
          <Button variant="danger" onClick={onConfirm}>{t('appointments.setup.conflict.save_anyway', 'Save anyway')}</Button>
        </div>
      </div>
    </div>
  )
}

/** A confirm(impact) that shows the dialog and resolves with the person's answer; render `dialog` where it should appear. */
// The hook and the dialog it renders stay in one small module, like AppointmentsProvider.
// eslint-disable-next-line react-refresh/only-export-components
export function useConflictConfirm(locale: string): { dialog: ReactNode; confirm: (impact: Impact) => Promise<boolean> } {
  const [impact, setImpact] = useState<Impact | null>(null)
  const resolver = useRef<((yes: boolean) => void) | null>(null)
  const confirm = useCallback((next: Impact) => new Promise<boolean>(resolve => {
    resolver.current = resolve
    setImpact(next)
  }), [])
  const answer = (yes: boolean) => {
    resolver.current?.(yes)
    resolver.current = null
    setImpact(null)
  }

  return {
    dialog: impact ? <ConflictDialog impact={impact} locale={locale} onConfirm={() => answer(true)} onCancel={() => answer(false)} /> : null,
    confirm,
  }
}
