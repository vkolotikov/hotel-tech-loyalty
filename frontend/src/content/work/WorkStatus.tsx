import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { errorKey } from '../lib/errors'
import type { useContentWork } from './useContentWork'

export function WorkStatus({ state }: { state: ReturnType<typeof useContentWork> }) {
  const { t } = useTranslation()
  const { work, error, uncertain } = state
  const code = error ?? work?.error
  const [key, fallback] = errorKey(state.action === 'fill' ? 'fill' : 'ai', code ?? '')
  return <div className="space-y-2" aria-live="polite">
    {state.busy && <p role="status" className="text-sm text-a-text-2">{t('content.launch.work_running', 'AI work is in progress. You can leave and return.')}</p>}
    {work?.status === 'cancelled' && <p className="text-sm text-a-text-2">{t('content.launch.work_cancelled', 'AI work cancelled. Earlier saved changes remain.')}</p>}
    {code && <Notice tone="danger">{t(key, fallback)}</Notice>}
    {uncertain && !state.starting && <Notice tone="info">{t('content.launch.work_uncertain', 'The start response was interrupted. Reconnect to this same request before starting another.')}</Notice>}
    <div className="flex flex-wrap gap-2">
      {(uncertain || (error && !state.rejected)) && !state.starting && <Button size="sm" variant="secondary" onClick={() => { void state.reconnect() }}>{t('content.launch.reconnect', 'Reconnect')}</Button>}
      {work?.can_cancel && <Button size="sm" variant="secondary" onClick={() => { void state.cancel() }}>{t('content.launch.cancel_work', 'Cancel AI work')}</Button>}
      {(work?.status === 'failed' || state.rejected) && state.canRetry && code !== 'ai_model_unpriced' && <Button size="sm" variant="secondary" onClick={() => { void state.retry() }}>{t('content.common.retry', 'Try again')}</Button>}
    </div>
  </div>
}
