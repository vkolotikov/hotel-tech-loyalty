import { useLayoutEffect, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe, LayoutGrid, LogOut, Menu, PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../i18n'
import { logoutAndRedirect } from '../lib/logout'
import { firstLetter } from './lib/firstLetter'
import { leave } from './lib/leave'
import type { LiveLook } from './lib/look'
import { markShell } from './lib/shellMark'
import { accentStyle, type AccentTokens } from './theme/accent'
import { ThemeSwitch } from './ui/ThemeSwitch'

export interface WorkspaceNavItem { to: string; end: boolean; icon: LucideIcon; label: string }

/**
 * A workspace's frame, the same for every workspace: an ink side panel that
 * collapses to icons (the organisation's mark, the workspace's own areas,
 * the Light/Dark/Auto switch, the way back to the full admin, the language,
 * the person and Sign out), and a top bar whose middle is the workspace's own
 * (`header`: its organisation line, Find and its main action), with the side
 * panel's secondary area folded into a menu below 1024 px. The root is the
 * token scope: `data-workspace` for the shared Atelier tokens and
 * `data-<workspace>` for the workspace's own rules. It marks
 * <html data-shell="<workspace>"> from the first paint, so the full admin's
 * mood typography stays out.
 */
export function WorkspaceShell({ workspace, look, accent, initial, organization, product, person, nav, fullAdmin, header, overlays, onLeave, children }: {
  /** The workspace's name: its root attribute (`data-appointments`) and its <html> mark. */
  workspace: string
  look: LiveLook
  accent: AccentTokens
  /** The organisation's mark in the side panel: one letter or one emoji. */
  initial: string
  organization?: string
  /** The line under the organisation in the side panel: the workspace's name. */
  product: string
  /** The signed-in person's name; the avatar draws its first letter. */
  person?: string
  nav: WorkspaceNavItem[]
  /** Where "Full admin" goes, or null where there is no full admin (the Appointments plan). */
  fullAdmin: string | null
  header: ReactNode
  /** Asked before "Full admin" and Sign out leave the workspace; false stays (unsaved work). */
  onLeave?: () => boolean
  /** Dialogs drawn over the whole frame (Find, the list of shortcuts). */
  overlays?: ReactNode
  children: ReactNode
}) {
  const { t, i18n } = useTranslation()
  // <html data-shell="<workspace>"> keeps the full admin's Branding mood typography out, from the first paint.
  useLayoutEffect(() => markShell(document.documentElement, workspace), [workspace])
  const slim = look.rail === 'slim'
  // Neither exit unloads a page the browser could ask about (Sign out even revokes the session first): the app is asked.
  const signOut = () => { leave(onLeave, () => { void logoutAndRedirect('/login') }) }
  const toFullAdmin = (e: MouseEvent) => { leave(onLeave, () => {}, e) }
  const language = (className: string) => (
    <label className="block">
      <span className="sr-only">{t('workspace.shell.language', 'Language')}</span>
      <select value={i18n.language?.slice(0, 2)} onChange={(e) => { void i18n.changeLanguage(e.target.value) }} className={className}>
        {SUPPORTED_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  )
  const scope = { [`data-${workspace}`]: '' } as Record<string, string>

  return (
    <div data-workspace="" {...scope} data-theme={look.resolved} data-accent-edge={accent.edge ? '' : undefined}
      style={accentStyle(accent) as CSSProperties} className="min-h-screen flex bg-a-canvas text-a-text">
      <aside data-rail="" data-rail-size={look.rail} aria-label={t('workspace.shell.menu', 'Menu')}
        className={`hidden lg:flex ${slim ? 'w-[76px]' : 'w-64'} shrink-0 flex-col gap-6 bg-a-side px-3 py-5 text-a-side-text transition-[width] duration-300 ease-out`}>
        <div className={`flex min-h-11 items-center gap-3 ${slim ? 'justify-center' : 'px-2'}`}>
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-a-accent font-a-display text-lg font-semibold text-a-accent-ink">{initial}</span>
          <div className={slim ? 'sr-only' : 'min-w-0'}>
            <div className="truncate text-[15px] font-semibold leading-tight">{organization}</div>
            <div className="truncate text-xs text-a-side-text-2">{product}</div>
          </div>
        </div>
        <nav className="space-y-1">
          {nav.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} data-tip={slim ? label : undefined}
              className={({ isActive }) => `relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${slim ? 'justify-center' : ''} ${isActive ? 'bg-a-side-2 text-a-side-text' : 'text-a-side-text-2 hover:bg-a-side-2/60 hover:text-a-side-text'}`}>
              {({ isActive }) => (
                <>
                  <Icon size={18} aria-hidden className="shrink-0" />
                  <span className={slim ? 'sr-only' : 'truncate'}>{label}</span>
                  {isActive && !slim && <span aria-hidden className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-a-accent-rail" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 border-t border-a-side-2 pt-4">
          <ThemeSwitch value={look.theme} onChange={look.setTheme} vertical={slim} />
          {fullAdmin !== null && (
            <Link to={fullAdmin} onClick={toFullAdmin} data-tip={slim ? t('workspace.shell.full_admin', 'Full admin') : undefined}
              className={`relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text ${slim ? 'justify-center' : ''}`}>
              <LayoutGrid size={16} aria-hidden className="shrink-0" /><span className={slim ? 'sr-only' : ''}>{t('workspace.shell.full_admin', 'Full admin')}</span>
            </Link>
          )}
          {!slim && <div className="px-1">{language('w-full rounded-lg bg-a-side-2 text-a-side-text text-sm px-2 py-1.5 border border-a-side-2')}</div>}
          {/* Slim: a globe with the real picker laid over it, transparent. The select keeps its "Language" name and opens on click and on the keyboard; its own focus ring is invisible at zero opacity, so the wrapper draws one. The opened list is drawn from the select's own colours, not the wrapper's, hence the explicit bg and text. */}
          {slim && (
            <div data-tip={t('workspace.shell.language', 'Language')}
              className="relative flex min-h-10 items-center justify-center rounded-xl text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-a-side-text">
              <Globe size={16} aria-hidden />
              {language('absolute inset-0 h-full w-full cursor-pointer opacity-0 bg-a-side-2 text-a-side-text')}
            </div>
          )}
          <div className={`flex items-center gap-2 px-1 ${slim ? 'justify-center' : ''}`}>
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-a-side-2 text-xs font-semibold">{firstLetter(person, '')}</span>
            <span className={slim ? 'sr-only' : 'min-w-0 flex-1 truncate text-xs text-a-side-text-2'}>{person}</span>
            {!slim && (
              <button type="button" onClick={signOut} className="rounded-lg p-2 text-a-side-text-2 hover:text-a-side-text" aria-label={t('workspace.shell.sign_out', 'Sign out')}>
                <LogOut size={16} aria-hidden />
              </button>
            )}
          </div>
          {slim && (
            <button type="button" onClick={signOut} data-tip={t('workspace.shell.sign_out', 'Sign out')}
              className="relative flex min-h-10 w-full items-center justify-center rounded-xl text-a-side-text-2 hover:bg-a-side-2/60 hover:text-a-side-text">
              <LogOut size={16} aria-hidden /><span className="sr-only">{t('workspace.shell.sign_out', 'Sign out')}</span>
            </button>
          )}
          <button type="button" onClick={() => look.setRail(slim ? 'full' : 'slim')} aria-expanded={!slim}
            data-tip={slim ? t('workspace.shell.expand', 'Expand menu') : undefined}
            className={`relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-a-side-text-2 transition-colors hover:bg-a-side-2/60 hover:text-a-side-text ${slim ? 'justify-center' : ''}`}>
            {slim ? <PanelLeftOpen size={16} aria-hidden /> : <PanelLeftClose size={16} aria-hidden />}
            <span className={slim ? 'sr-only' : ''}>{slim ? t('workspace.shell.expand', 'Expand menu') : t('workspace.shell.collapse', 'Collapse menu')}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 lg:px-6 bg-a-canvas border-b border-a-border">
          <nav className="flex lg:hidden items-center gap-1" aria-label={t('workspace.shell.menu', 'Menu')}>
            {nav.map(({ to, end, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={end} aria-label={label}
                className={({ isActive }) => `rounded-lg p-2 ${isActive ? 'bg-a-surface-2 text-a-text' : 'text-a-text-2'}`}>
                <Icon size={18} aria-hidden />
              </NavLink>
            ))}
          </nav>
          {header}
          {/* Below the width of the rail, what the rail's secondary area holds lives here. */}
          <details className="relative lg:hidden">
            <summary className="list-none cursor-pointer rounded-lg p-2 text-a-text-2 hover:text-a-text [&::-webkit-details-marker]:hidden" aria-label={t('workspace.shell.menu', 'Menu')}>
              <Menu size={18} aria-hidden />
            </summary>
            {/* As wide as what it holds (the theme switch is longer in Russian), at least 14rem, never past the screen. */}
            <div className="absolute right-0 top-full z-40 mt-2 w-max min-w-56 max-w-[calc(100vw-2rem)] animate-a-pop space-y-1 rounded-lg border border-a-border bg-a-surface p-2 shadow-lg">
              <div className="px-2 py-1 text-xs text-a-text-2 break-words">{person}</div>
              <div className="px-1 pb-1"><ThemeSwitch value={look.theme} onChange={look.setTheme} tone="surface" /></div>
              {fullAdmin !== null && (
                <Link to={fullAdmin} onClick={toFullAdmin} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-a-text hover:bg-a-surface-2">
                  <LayoutGrid size={16} aria-hidden /> {t('workspace.shell.full_admin', 'Full admin')}
                </Link>
              )}
              <div className="px-2 py-1">
                {language('w-full rounded-md border border-a-border bg-a-surface px-2 py-1.5 text-sm text-a-text')}
              </div>
              <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-a-text hover:bg-a-surface-2">
                <LogOut size={16} aria-hidden /> {t('workspace.shell.sign_out', 'Sign out')}
              </button>
            </div>
          </details>
        </header>
        {children}
      </div>
      {overlays}
    </div>
  )
}
