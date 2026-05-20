import { useTranslation } from 'react-i18next'
import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { Globe, Check } from 'lucide-react'
import { SUPPORTED_LANGUAGES, type LangCode } from '../i18n'
import { api } from '../lib/api'

/**
 * Compact language switcher used in the sidebar user panel + the
 * Login page. Persists the choice three ways:
 *
 *   1. i18n.changeLanguage() — flips the in-memory locale, triggering
 *      a re-render in everything that uses `useTranslation()`.
 *   2. localStorage `admin_lang` — picked up on next page-load so the
 *      switch survives a hard refresh before the auth round-trip.
 *      (Already handled by `i18next-browser-languagedetector`.)
 *   3. `PUT /v1/admin/me/preferences { language }` — syncs to the
 *      server so the user gets the same locale on every device, and
 *      so the admin AI / emails can read the user's preference.
 *      Server write is fire-and-forget — the UI doesn't block on it.
 *
 * NOTE on flag emojis: previous versions of this switcher rendered
 * Unicode flag emojis (regional-indicator pairs). Windows browsers
 * have no colour-emoji font for those pairs, so users on Windows
 * saw "US RU DE FR ES" as letter fragments next to the language
 * code — looked like broken images. The current design uses a
 * compact code chip ("EN", "RU"…) plus the native language name
 * which renders identically everywhere.
 */
export function LangSwitcher({ collapsed = false, variant = 'sidebar' }: {
  collapsed?: boolean
  variant?: 'sidebar' | 'inline'
}) {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Click-outside dismiss. Avoids the popover lingering when the user
  // navigates or clicks elsewhere in the sidebar.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language)
    ?? SUPPORTED_LANGUAGES.find(l => l.code === i18n.resolvedLanguage)
    ?? SUPPORTED_LANGUAGES[0]

  const choose = async (code: LangCode) => {
    setOpen(false)
    if (code === current.code) return
    await i18n.changeLanguage(code)
    // Fire-and-forget server sync. If it fails we still kept the
    // localStorage write — next page-load picks up the new locale
    // regardless.
    try { await api.put('/v1/admin/me/preferences', { language: code }) } catch {}
  }

  return (
    <div ref={ref} className={clsx('relative', variant === 'inline' ? 'inline-block' : '')}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`${t('app.language', 'Language')}: ${current.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          'flex items-center gap-1.5 rounded-md text-t-secondary hover:text-white hover:bg-dark-surface2 transition-colors',
          collapsed ? 'justify-center w-9 h-9' : 'px-1.5 py-1',
        )}
      >
        <Globe size={14} />
        {!collapsed && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-500/15 text-primary-300 border border-primary-500/25">
            {current.code}
          </span>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('app.language', 'Language')}
          className="absolute bottom-full right-0 mb-2 min-w-[180px] rounded-lg border border-dark-border bg-dark-surface shadow-2xl py-1 z-50"
        >
          {SUPPORTED_LANGUAGES.map(l => {
            const isActive = l.code === current.code
            return (
              <button
                key={l.code}
                role="option"
                aria-selected={isActive}
                onClick={() => choose(l.code)}
                className={clsx(
                  'flex items-center gap-2.5 w-full px-2.5 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-primary-500/10 text-white'
                    : 'text-t-secondary hover:bg-white/[0.04] hover:text-white',
                )}
              >
                <span className={clsx(
                  'inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded text-[10px] font-bold uppercase tracking-wider border',
                  isActive
                    ? 'bg-primary-500/20 text-primary-300 border-primary-500/40'
                    : 'bg-dark-surface2 text-t-secondary border-dark-border',
                )}>
                  {l.code}
                </span>
                <span className="flex-1 text-left">{l.label}</span>
                {isActive && <Check size={13} className="text-primary-400 flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
