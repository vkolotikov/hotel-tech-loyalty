import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { registerPortalLocales } from '../i18n'
import { applyPortalTheme, clearPortalTheme, type PortalThemeInput } from '../theme/applyPortalTheme'
import { Card } from '../ui/Card'

registerPortalLocales()

/**
 * The token scope for pages that have no session yet; paints the venue when
 * the join context carries a theme, and names the browser tab when given a
 * title (restoring the previous one on the way out).
 */
export function PublicShell({ theme, title, children }: { theme?: PortalThemeInput | null; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!theme) return
    const root = document.documentElement
    applyPortalTheme(root, theme)
    return () => clearPortalTheme(root)
  }, [theme])

  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => { document.title = previous }
  }, [title])

  return (
    <div data-portal="" className="min-h-screen flex items-center justify-center p-4 font-p-body">
      <Card className="w-full max-w-sm p-6 p-rise">{children}</Card>
    </div>
  )
}

export function Problem({ title, body }: { title: string; body: string }) {
  const { t } = useTranslation()
  return (
    <div className="text-center">
      <div className="w-11 h-11 rounded-full bg-p-warning/10 text-p-warning flex items-center justify-center mx-auto mb-3"><AlertTriangle size={20} aria-hidden /></div>
      <h1 className="font-p-display text-xl mb-1">{title}</h1>
      <p className="text-sm text-p-text-2">{body}</p>
      <Link to="/login" className="inline-block mt-4 text-sm text-p-accent-deep">{t('portal.join.go_sign_in', 'Go to sign in')}</Link>
    </div>
  )
}
