import { useTranslation } from 'react-i18next'
import { Copy, CopyPlus, LayoutTemplate, Link2, MoreHorizontal, Trash2 } from 'lucide-react'
import { SideMenu } from '../shell/SideMenu'
import type { PostActionsState } from './postActionsState'

const ITEM = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-a-text hover:bg-a-surface-2 focus-visible:bg-a-surface-2 aria-disabled:opacity-50'

/** The ⋯ menu's choices (spec 2026-10-21 §7.2): Duplicate, Copy text, Copy link for the team, Save as template (managers), Delete. */
export function MoreList({ actions: a }: { actions: PostActionsState }) {
  const { t } = useTranslation()
  // While edits or an action wait, the items stay in the arrow keys' reach (aria-disabled) and do nothing.
  const off = a.waits || undefined
  const run = (fn: () => void) => () => { if (!a.waits) fn() }
  return (
    <>
      {a.dirty && <p className="px-2.5 py-1.5 text-xs text-a-text-2">{t('content.panel.ai.save_first', 'Save your changes first.')}</p>}
      <button type="button" role="menuitem" tabIndex={-1} aria-disabled={off} onClick={run(a.duplicate)} className={ITEM}>
        <CopyPlus size={15} aria-hidden className="shrink-0 text-a-text-2" />{t('content.panel.actions.duplicate', 'Duplicate')}
      </button>
      <button type="button" role="menuitem" tabIndex={-1} aria-disabled={off} onClick={run(a.copy)} className={ITEM}>
        <Copy size={15} aria-hidden className="shrink-0 text-a-text-2" />{a.copied ? t('content.panel.actions.copied', 'Copied') : t('content.panel.actions.copy', 'Copy text')}
      </button>
      <button type="button" role="menuitem" tabIndex={-1} aria-disabled={off} onClick={run(a.copyLink)} className={ITEM}>
        <Link2 size={15} aria-hidden className="shrink-0 text-a-text-2" />{a.linkCopied ? t('content.panel.actions.link_copied', 'Link copied') : t('content.panel.actions.copy_link', 'Copy link for the team')}
      </button>
      {a.canManage && (
        <button type="button" role="menuitem" tabIndex={-1} aria-disabled={off} onClick={run(() => a.setTemplating(true))} className={ITEM}>
          <LayoutTemplate size={15} aria-hidden className="shrink-0 text-a-text-2" />{t('content.panel.actions.save_template', 'Save as template')}
        </button>
      )}
      <button type="button" role="menuitem" tabIndex={-1} aria-disabled={off} onClick={run(() => a.setConfirmDelete(true))} className={`${ITEM} text-a-danger`}>
        <Trash2 size={15} aria-hidden className="shrink-0" />{t('content.panel.actions.delete', 'Delete')}
      </button>
    </>
  )
}

/** ⋯ in the panel's header: the saved post's other actions (their confirmation, notes and editor show above the tabs: MoreOutcome). */
export function PanelMore({ actions }: { actions: PostActionsState }) {
  const { t } = useTranslation()
  return (
    <SideMenu label={t('content.panel.more', 'More actions')} named kind="menu" place="down-right" listClassName="w-60"
      buttonClassName="rounded-lg p-1.5 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text"
      face={<MoreHorizontal size={18} aria-hidden />}>
      <MoreList actions={actions} />
    </SideMenu>
  )
}
