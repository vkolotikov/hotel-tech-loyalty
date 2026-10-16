import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { ShortcutsSheet } from '../../workspace/ui/ShortcutsSheet'

/**
 * The list of shortcuts behind "?" (spec §4.7): the keys for every page
 * first, then the Plan's own under "On the plan" — the sheet opens anywhere,
 * but the week, view and card keys work only there.
 */
export function ContentShortcuts({ open, onClose, modKey, fallbackFocus }: {
  open: boolean
  onClose: () => void
  /** "Ctrl", or "⌘" on a Mac. */
  modKey: string
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  const { t } = useTranslation()
  return (
    <ShortcutsSheet open={open} onClose={onClose} fallbackFocus={fallbackFocus} sections={[
      { rows: [
        { name: t('content.shortcuts.find', 'Find'), keys: [[`${modKey} K`], ['/']] },
        { name: t('content.shell.new_post', 'New post'), keys: [['N']] },
        { name: t('content.shortcuts.idea', 'Add an idea'), keys: [['I']] },
        { name: t('content.shortcuts.help', 'This list'), keys: [['?']] },
      ] },
      { title: t('content.shortcuts.on_plan', 'On the plan'), rows: [
        { name: t('content.shortcuts.this_week', 'This week'), keys: [['T']] },
        { name: t('content.shortcuts.pages', 'Previous or next week (month in the month view)'), keys: [['←', '→']] },
        { name: t('content.shortcuts.views', 'Week, month, list'), keys: [['W', 'M', 'L']] },
        { name: t('content.shortcuts.move', 'Move a focused post a day'), keys: [['Shift ←', 'Shift →']] },
        { name: t('content.shortcuts.close', 'Close the panel'), keys: [['Esc']] },
      ] },
    ]} />
  )
}
