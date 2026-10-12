import { useTranslation } from 'react-i18next'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import type { ThemePref } from '../lib/look'

/**
 * Light / Dark / Auto (spec D2). On the ink side panel (`tone="side"`) or on a
 * surface (the narrow-screen menu). Vertical in the slim side panel, where
 * the words become the buttons' names and a hover/focus label.
 */
export function ThemeSwitch({ value, onChange, vertical = false, tone = 'side' }: {
  value: ThemePref; onChange: (value: ThemePref) => void; vertical?: boolean; tone?: 'side' | 'surface'
}) {
  const { t } = useTranslation()
  const items: [ThemePref, string, LucideIcon][] = [
    ['light', t('appointments.theme.light', 'Light'), Sun],
    ['dark', t('appointments.theme.dark', 'Dark'), Moon],
    ['auto', t('appointments.theme.auto', 'Auto'), Monitor],
  ]
  const side = tone === 'side'
  return (
    <div role="group" aria-label={t('appointments.theme.label', 'Theme')}
      className={`flex gap-1 rounded-xl p-1 ${vertical ? 'flex-col' : ''} ${side ? 'bg-a-side-2/60' : 'bg-a-surface-2'}`}>
      {items.map(([v, label, Icon]) => {
        const on = value === v
        return (
          <button key={v} type="button" aria-pressed={on} onClick={() => onChange(v)}
            title={v === 'auto' && !vertical ? t('appointments.theme.auto_hint', 'Auto follows this device') : undefined}
            data-tip={vertical ? label : undefined}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs transition-colors ${on
              ? `font-semibold ${side ? 'bg-a-side-2 text-a-side-text' : 'bg-a-surface text-a-text shadow-a-sm'}`
              : `font-medium ${side ? 'text-a-side-text-2 hover:text-a-side-text' : 'text-a-text-2 hover:text-a-text'}`}`}>
            <Icon size={15} aria-hidden />
            <span className={vertical ? 'sr-only' : ''}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
