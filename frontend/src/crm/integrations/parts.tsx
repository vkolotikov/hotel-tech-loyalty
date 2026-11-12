import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useToast } from '../ui/Toast'
import { ago } from './integrationsLogic'

/** Copy a text to the clipboard and say so; the icon turns into a tick for a moment. */
export function useCopy(): [(text: string, key?: string) => void, string | null] {
  const { t } = useTranslation()
  const say = useToast()
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (text: string, key = 'copy') => {
    const done = () => {
      setCopied(key)
      say(t('crm.integrations.copied', 'Copied'))
      window.setTimeout(() => setCopied(current => (current === key ? null : current)), 2000)
    }
    const failed = () => say(t('crm.integrations.copy_failed', 'Could not copy. Select the text and copy it yourself.'), 'danger')
    if (!navigator.clipboard?.writeText) { failed(); return }
    void navigator.clipboard.writeText(text).then(done, failed)
  }
  return [copy, copied]
}

/** A copy button with its icon and a short label. */
export function CopyButton({ text, copyKey, label, copy, copied, variant = 'secondary' }: {
  text: string
  copyKey: string
  label: string
  copy: (text: string, key?: string) => void
  copied: string | null
  variant?: 'primary' | 'secondary'
}) {
  const { t } = useTranslation()
  const done = copied === copyKey
  return (
    <Button variant={variant} size="sm" onClick={() => copy(text, copyKey)} aria-live="polite">
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {done ? t('crm.integrations.copied', 'Copied') : label}
    </Button>
  )
}

/** A block of code: monospaced, scrolls inside itself, never widens the page. */
export function CodeBlock({ children, label, tall = false }: { children: ReactNode; label: string; tall?: boolean }) {
  return (
    <pre aria-label={label} tabIndex={0}
      className={`${tall ? 'max-h-96' : 'max-h-72'} min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-a-border bg-a-surface-2 p-3 font-a-mono text-xs leading-relaxed text-a-text focus-visible:outline-2 focus-visible:outline-a-accent`}>
      {children}
    </pre>
  )
}

/** "5 min ago", "yesterday", in the person's language; `never` when there is no instant. */
export function Ago({ iso, never }: { iso: string | null; never: string }) {
  const { t, i18n } = useTranslation()
  const when = ago(iso, Date.now())
  if (when === null) return <>{never}</>
  if (when === 'now') return <>{t('crm.integrations.just_now', 'just now')}</>
  let text: string
  try {
    text = new Intl.RelativeTimeFormat(i18n.language || 'en', { numeric: 'auto' }).format(when.value, when.unit)
  } catch {
    text = `${-when.value} ${when.unit}`
  }
  return <time dateTime={iso ?? undefined} title={iso ?? undefined}>{text}</time>
}

/** A day as the venue's calendar shows it ("4 Nov 2026"). */
export function dayText(iso: string | null, zone: string, lang: string): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(lang || 'en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

/** A field's problem, under it. */
export function Problem({ children }: { children: ReactNode }) {
  return <p role="alert" className="mt-1 text-xs text-a-danger">{children}</p>
}
