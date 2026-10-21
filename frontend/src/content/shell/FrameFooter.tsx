import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronsUpDown, Keyboard, LayoutGrid, LifeBuoy, LogOut, PanelLeftClose, PanelLeftOpen, Search, Settings } from 'lucide-react'
import { logoutAndRedirect } from '../../lib/logout'
import { firstLetter } from '../../workspace/lib/firstLetter'
import { leave } from '../../workspace/lib/leave'
import type { LiveLook } from '../../workspace/lib/look'
import { LanguageSelect } from '../../workspace/ui/LanguageSelect'
import { ThemeSwitch } from '../../workspace/ui/ThemeSwitch'
import { roleLabelKey } from './shellMath'
import { SideMenu } from './SideMenu'

/** What the side panel's foot and the phone menu need. */
interface FootProps {
  look: LiveLook
  /** Where "Full admin" goes, or null where there is none. */
  fullAdmin: string | null
  person?: string
  role: string | null
  /** Asked before Full admin and Sign out leave (unsaved work); false stays. */
  onLeave: () => boolean
  onShortcuts: () => void
  onFind: () => void
}

const ITEM = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-a-text hover:bg-a-surface-2 focus-visible:bg-a-surface-2'
const SELECT = 'w-full rounded-md border border-a-border bg-a-surface px-2 py-1.5 text-sm text-a-text'

/** Settings, opened (spec 2026-10-21 §4.1): Light / Dark / Auto, the language, and Full admin where there is one. */
export function SettingsPanel({ look, fullAdmin, onLeave }: Pick<FootProps, 'look' | 'fullAdmin' | 'onLeave'>) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2 p-1">
      <ThemeSwitch value={look.theme} onChange={look.setTheme} tone="surface" />
      <div className="px-1"><LanguageSelect className={SELECT} /></div>
      {fullAdmin !== null && (
        <Link to={fullAdmin} onClick={(e) => leave(onLeave, () => {}, e)} className={ITEM}>
          <LayoutGrid size={16} aria-hidden className="shrink-0 text-a-text-2" />{t('workspace.shell.full_admin', 'Full admin')}
        </Link>
      )}
    </div>
  )
}

/** Help & resources, opened: the list of keyboard shortcuts and Find. */
export function HelpList({ onShortcuts, onFind }: Pick<FootProps, 'onShortcuts' | 'onFind'>) {
  const { t } = useTranslation()
  return (
    <>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { onShortcuts() }} className={ITEM}>
        <Keyboard size={16} aria-hidden className="shrink-0 text-a-text-2" />{t('content.find.shortcuts', 'Keyboard shortcuts')}
      </button>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { onFind() }} className={ITEM}>
        <Search size={16} aria-hidden className="shrink-0 text-a-text-2" />{t('content.shell.find_short', 'Find')}
      </button>
    </>
  )
}

/** The person's menu, opened: collapse (or expand) the side panel, and Sign out. */
export function PersonList({ look, onLeave }: Pick<FootProps, 'look' | 'onLeave'>) {
  const { t } = useTranslation()
  const slim = look.rail === 'slim'
  return (
    <>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { look.setRail(slim ? 'full' : 'slim') }} className={ITEM}>
        {slim ? <PanelLeftOpen size={16} aria-hidden className="shrink-0 text-a-text-2" /> : <PanelLeftClose size={16} aria-hidden className="shrink-0 text-a-text-2" />}
        {slim ? t('workspace.shell.expand', 'Expand menu') : t('workspace.shell.collapse', 'Collapse menu')}
      </button>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { leave(onLeave, () => { void logoutAndRedirect('/login') }) }} className={ITEM}>
        <LogOut size={16} aria-hidden className="shrink-0 text-a-text-2" />{t('workspace.shell.sign_out', 'Sign out')}
      </button>
    </>
  )
}

/**
 * The side panel's foot in HexaTech Content (spec 2026-10-21 §4.1, D8): Settings, Help & resources, and the person with
 * their role — each opening upward (beside the panel while it is icons only).
 */
export function FrameFooter(props: FootProps) {
  const { t } = useTranslation()
  const { look, person, role } = props
  const slim = look.rail === 'slim'
  const row = `relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text ${slim ? 'justify-center' : ''}`
  const place = slim ? 'beside' : 'up'
  return (
    <div data-frame-footer="" className="mt-auto space-y-1 border-t border-a-side-2 pt-4">
      <SideMenu label={t('content.shell.settings', 'Settings')} icon={Settings} kind="panel" place={place} slim={slim} buttonClassName={row}>
        <SettingsPanel look={look} fullAdmin={props.fullAdmin} onLeave={props.onLeave} />
      </SideMenu>
      <SideMenu label={t('content.shell.help', 'Help & resources')} icon={LifeBuoy} kind="menu" place={place} slim={slim} buttonClassName={row}>
        <HelpList onShortcuts={props.onShortcuts} onFind={props.onFind} />
      </SideMenu>
      <div className="border-t border-a-side-2 pt-2">
        <SideMenu label={person ?? ''} kind="menu" place={place} slim={slim}
          buttonClassName={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-a-side-2/60 ${slim ? 'justify-center' : ''}`}
          face={<>
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-a-accent text-xs font-semibold text-a-accent-ink">{firstLetter(person, '')}</span>
            <span className={slim ? 'sr-only' : 'min-w-0 flex-1'}>
              <span className="block truncate text-sm font-medium text-a-side-text">{person}</span>
              <span className="block truncate text-xs text-a-side-text-2">{t(...roleLabelKey(role))}</span>
            </span>
            {!slim && <ChevronsUpDown size={14} aria-hidden className="shrink-0 text-a-side-text-2" />}
          </>}>
          <PersonList look={look} onLeave={props.onLeave} />
        </SideMenu>
      </div>
    </div>
  )
}

/** Closes the phone menu (a <details>) a choice sat in: what it opens covers the page. */
const shut = (el: HTMLElement) => { el.closest('details')?.removeAttribute('open') }

/** The phone menu in HexaTech Content (below 1024 px): the person, Settings' controls, Help's two, and Sign out. */
export function PhoneMenu(props: FootProps) {
  const { t } = useTranslation()
  const { look, person, role } = props
  return (
    <div data-phone-menu="" className="space-y-1">
      <div className="px-2 py-1">
        <div className="break-words text-sm font-medium text-a-text">{person}</div>
        <div className="text-xs text-a-text-2">{t(...roleLabelKey(role))}</div>
      </div>
      <SettingsPanel look={look} fullAdmin={props.fullAdmin} onLeave={props.onLeave} />
      <button type="button" onClick={(e) => { shut(e.currentTarget); props.onShortcuts() }} className={ITEM}>
        <Keyboard size={16} aria-hidden className="shrink-0 text-a-text-2" />{t('content.find.shortcuts', 'Keyboard shortcuts')}
      </button>
      <button type="button" onClick={(e) => { shut(e.currentTarget); props.onFind() }} className={ITEM}>
        <Search size={16} aria-hidden className="shrink-0 text-a-text-2" />{t('content.shell.find_short', 'Find')}
      </button>
      <button type="button" onClick={() => leave(props.onLeave, () => { void logoutAndRedirect('/login') })} className={ITEM}>
        <LogOut size={16} aria-hidden className="shrink-0 text-a-text-2" />{t('workspace.shell.sign_out', 'Sign out')}
      </button>
    </div>
  )
}
