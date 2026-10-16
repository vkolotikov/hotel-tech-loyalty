import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { usePanel } from './PanelProvider'

/**
 * The post panel when it broke while drawing (spec 2026-10-15 §3.3): the portal's notice in the panel's own place and
 * a Close that does not ask about edits the broken panel can no longer hold.
 */
export function PanelFailed() {
  const { t } = useTranslation()
  const panel = usePanel()
  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="content-panel-failed" data-panel=""
      className="fixed bottom-0 right-0 top-14 z-30 flex w-full flex-col gap-3 border-l border-a-border bg-a-surface p-4 shadow-a-lg sm:w-[480px]">
      <h2 id="content-panel-failed" className="font-a-display text-xl font-normal text-a-text">{t('content.panel.title', 'Post')}</h2>
      <Notice tone="danger">{t('content.panel.failed', 'This post could not be shown. What you saved is safe.')}</Notice>
      <Button variant="secondary" onClick={() => { panel.reportDirty(false); panel.close() }}>{t('content.common.close', 'Close')}</Button>
    </aside>
  )
}
