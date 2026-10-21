import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { TemplateEditor } from '../brand/sections/Templates'
import { templateFromPost } from '../brand/templateActions'
import type { PostDetail } from '../lib/types'
import { Dialog } from '../ui/Dialog'
import type { PostActionsState } from './postActionsState'

/**
 * What the ⋯ menu and the post's actions answered (spec 2026-10-21 §7.2), above the tabs so every tab shows it: the
 * delete confirmation (brought into view), "Copied" and "Link copied", an action's refusal, and the template editor.
 */
export function MoreOutcome({ post, actions: a, pillarName = null }: { post: PostDetail; actions: PostActionsState; pillarName?: string | null }) {
  const { t } = useTranslation()
  const confirm = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (a.confirmDelete) confirm.current?.scrollIntoView({ block: 'nearest' })
  }, [a.confirmDelete])
  const copied = a.copied ? t('content.panel.actions.copied', 'Copied') : a.linkCopied ? t('content.panel.actions.link_copied', 'Link copied') : null
  if (!a.confirmDelete && !copied && !a.error && !a.templating) return null
  return (
    <div data-more-outcome="" className="space-y-2">
      {a.confirmDelete && (
        <div ref={confirm} role="alert" className="space-y-2 rounded-lg border border-a-danger/30 bg-a-danger/10 p-3">
          <p className="text-sm text-a-text">{t('content.panel.actions.delete_confirm', 'Delete this post? This cannot be undone.')}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={a.busy === 'delete'} onClick={a.remove}>{t('content.panel.actions.delete_yes', 'Delete post')}</Button>
            <Button size="sm" variant="secondary" disabled={a.busy === 'delete'} onClick={() => a.setConfirmDelete(false)}>{t('content.common.cancel', 'Cancel')}</Button>
          </div>
        </div>
      )}
      {copied && <p role="status" className="flex items-center gap-1.5 text-sm text-a-text-2"><Check size={14} aria-hidden className="text-a-success" />{copied}</p>}
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      {a.templating && (
        <Dialog title={t('content.panel.actions.save_template', 'Save as template')} onClose={() => a.setTemplating(false)}>
          <TemplateEditor template={null} initial={templateFromPost(post, pillarName)} onDone={() => a.setTemplating(false)} />
        </Dialog>
      )}
    </div>
  )
}
