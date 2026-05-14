import { useTranslation } from 'react-i18next'
import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { Globe, Check } from 'lucide-react'
import { SUPPORTED_LANGUAGES, type LangCode } from '../i18n'
import { api } from '../lib/api'

/**
 * Compact language switcher used in the sidebar user panel. Persists
 * the choice three ways:
 *
 *   1. i18n.changeLanguage() — flips the in-memory locale, triggering
 *      a re-render in everything that uses `useTranslation()`.
 *   2. localStorage `admin_lang` — picked up on next page-load so the
 *      switch survives a hard refresh before the auth round-trip.
 *      (Already handled by `i18next-browser-languagedetector`.)
 *   3. `PATCH /v1/admin/me/preferences { language }` — syncs to the
 *      server so the user gets the same locale on every device, and
 *      so the admin AI / emails can read the user's preference.
 *      Server write is fire-and-forget — the UI doesn't block on it.
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
        title={t('app.language', 'Language')}
        className={clsx(
          'flex items-center gap-2 text-t-secondary hover:text-white text-xs transition-colors w-full',
          collapsed ? 'justify-center' : '',
        )}
      >
        <Globe size={15} />
        {!collapsed && (
          <>
            <span className="text-base leading-none">{current.flag}</span>
            <span className="uppercase tracking-wider text-[10px]">{current.code}</span>
          </>
        )}
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 min-w-[160px] rounded-lg border border-dark-border bg-dark-surface2 shadow-xl py-1 z-50"
        >
          {SUPPORTED_LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => choose(l.code)}
              className={clsx(
                'flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-white/[0.04] transition-colors',
                l.code === current.code ? 'text-white' : 'text-t-secondary',
              )}
            >
              <span className="text-base leading-none">{l.flag}</span>
              <span className="flex-1 text-left">{l.label}</span>
              {l.code === current.code && <Check size={13} className="text-primary-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
