import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { ShortcutsSheet } from '../../workspace/ui/ShortcutsSheet'

/** The list of shortcuts behind "?" (spec 2026-10-21 §4.8): the keys for every page, then a member's page's own. */
export function LoyaltyShortcuts({ open, onClose, modKey, fallbackFocus }: {
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
        { name: t('loyalty.shortcuts.find', 'Find a member'), keys: [[`${modKey} K`], ['/']] },
        { name: t('loyalty.shortcuts.scan', 'Scan a card'), keys: [['S']] },
        { name: t('loyalty.shortcuts.help', 'This list'), keys: [['?']] },
      ] },
      { title: t('loyalty.shortcuts.on_member', 'On a member’s page'), rows: [
        { name: t('loyalty.member.award', 'Award points'), keys: [['A']] },
        { name: t('loyalty.member.redeem', 'Redeem points'), keys: [['R']] },
      ] },
    ]} />
  )
}
