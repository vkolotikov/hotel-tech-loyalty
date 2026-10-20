import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { PromotionRun } from '../lib/types'
import { runLine } from './promoteMath'

/** A promotion as it stands (spec 2026-10-20 §5): writing (with Stop for managers), or what it added and what failed. */
export function PromotionLine({ run, canManage, showPlanLink = true }: { run: PromotionRun; canManage: boolean; showPlanLink?: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const line = runLine(run, t)
  if (line === null || run.status === 'idle') return null

  const stop = async () => {
    setStopping(true)
    setError(null)
    try {
      queryClient.setQueryData(['content', brand, 'promotion'], await api.stopPromotion())
    } catch (e) {
      const [key, text] = errorKey('promote', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setStopping(false)
    }
  }

  if (run.status === 'running') {
    return (
      <div data-promotion-line="" id="content-promotion-line" tabIndex={-1} className="space-y-2 rounded-xl border border-a-border bg-a-surface p-3 outline-none">
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="flex min-w-0 flex-1 items-center gap-2 text-sm text-a-text">
            <Loader2 size={14} aria-hidden className="shrink-0 motion-safe:animate-spin" /><span>{line.text}</span>
          </p>
          {canManage && <Button size="sm" variant="secondary" loading={stopping} onClick={() => { void stop() }}>{t('content.promote.run.stop', 'Stop')}</Button>}
        </div>
        {line.failures.length > 0 && <ul className="list-disc pl-5 text-xs text-a-text-2">{line.failures.map((f, i) => <li key={i} className="break-words">{f}</li>)}</ul>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    )
  }
  return (
    <div data-promotion-line="" id="content-promotion-line" tabIndex={-1} className="outline-none">
      <Notice tone={line.tone}>
        <span className="block break-words">{line.text}</span>
        {line.failures.length > 0 && <ul className="mt-1 list-disc pl-5">{line.failures.map((f, i) => <li key={i} className="break-words">{f}</li>)}</ul>}
        {showPlanLink && run.created_count > 0 && (
          <Link to="/content" className="mt-1 inline-block font-semibold text-a-accent-text hover:underline">{t('content.promote.run.open_plan', 'Open the Plan')}</Link>
        )}
      </Notice>
    </div>
  )
}
