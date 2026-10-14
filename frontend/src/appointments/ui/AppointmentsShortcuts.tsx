import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { ShortcutsSheet } from '../../workspace/ui/ShortcutsSheet'

/**
 * The list of shortcuts behind "?" in the Appointments workspace: the keys
 * for every page first, then the calendar's own under "On the calendar" —
 * the sheet opens anywhere, but the day, view and card keys work only there.
 */
export function AppointmentsShortcuts({ open, onClose, modKey, fallbackFocus }: {
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
        { name: t('appointments.shortcuts.find', 'Find'), keys: [[`${modKey} K`], ['/']] },
        { name: t('appointments.shell.new_appointment', 'New appointment'), keys: [['N']] },
        { name: t('appointments.shortcuts.help', 'This list'), keys: [['?']] },
      ] },
      { title: t('appointments.shortcuts.on_calendar', 'On the calendar'), rows: [
        { name: t('appointments.calendar.today', 'Today'), keys: [['T']] },
        { name: t('appointments.shortcuts.days', 'Previous or next day (week in the week view)'), keys: [['←', '→']] },
        { name: t('appointments.shortcuts.views', 'Day, week, list'), keys: [['D', 'W', 'L']] },
        { name: t('appointments.shortcuts.close', 'Close the panel'), keys: [['Esc']] },
        { name: t('appointments.shortcuts.card', 'Move a selected appointment'), keys: [['↑', '↓', '←', '→']] },
      ] },
    ]} />
  )
}
