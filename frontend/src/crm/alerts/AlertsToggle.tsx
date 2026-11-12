import { useTranslation } from 'react-i18next'
import { Bell, BellOff } from 'lucide-react'
import { useToast } from '../ui/Toast'
import { toggleState } from './alertsLogic'
import { askPermission, setWantsDesktop, useDesktop } from './desktop'

/**
 * Round 5: the one place the browser is asked whether HexaTech CRM may show desktop notifications (the inbox's header).
 * Pressed: alerts on this device; a press switches them off, or on, or asks the browser the first time. Blocked in the
 * browser's settings or not supported, it says so and cannot be pressed.
 */
export function AlertsToggle() {
  const { t } = useTranslation()
  const toast = useToast()
  const desktop = useDesktop()
  const state = toggleState(desktop.permission, desktop.wanted)
  const label = state.reason === 'on' ? t('crm.alerts.toggle_on', 'Desktop alerts are on')
    : state.reason === 'blocked' ? t('crm.alerts.toggle_blocked', 'Desktop alerts are blocked in this browser’s settings')
    : state.reason === 'unsupported' ? t('crm.alerts.toggle_unsupported', 'This browser cannot show desktop alerts')
    : t('crm.alerts.toggle_off', 'Turn on desktop alerts')

  const press = () => {
    if (state.action === 'ask') {
      void askPermission().then(answer => {
        if (answer === 'granted') toast(t('crm.alerts.turned_on', 'Desktop alerts are on'))
        else if (answer === 'denied') toast(t('crm.alerts.toggle_blocked', 'Desktop alerts are blocked in this browser’s settings'), 'danger')
      })
    } else if (state.action === 'on') {
      setWantsDesktop(true)
      toast(t('crm.alerts.turned_on', 'Desktop alerts are on'))
    } else if (state.action === 'off') {
      setWantsDesktop(false)
      toast(t('crm.alerts.turned_off', 'Desktop alerts are off'))
    }
  }

  const Icon = state.on ? Bell : BellOff
  return (
    <button type="button" aria-pressed={state.on} title={label} aria-label={label} onClick={press} disabled={state.action === 'none'}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-a-accent disabled:cursor-not-allowed disabled:opacity-40 ${state.on ? 'border-a-accent/40 bg-a-accent/12 text-a-accent-text' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
      <Icon size={16} aria-hidden />
    </button>
  )
}
