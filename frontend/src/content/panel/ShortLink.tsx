import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import type { ShortLinkFacts } from '../lib/types'
import { CopyButton } from '../ui/CopyButton'
import { LINK_NOTES, barsOf, linkState } from './linkMath'

/**
 * Under the Link field (spec 2026-10-19 §5.5): the short link with Copy, its clicks in all and from the bio page, and a
 * bar for each of the last 14 venue days, each named for a screen reader with its day and count. Before the first save
 * of a Link, and while an edit would move, clear or switch the short link back on, a line says what saving does — in a
 * polite live region that is there, empty, before any words come into it, so a screen reader hears it (final review).
 */
export function ShortLink({ typed, link }: { typed: string; link: ShortLinkFacts | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const state = linkState(typed, link)
  const words = state === 'none' || state === 'live' ? '' : t(`content.links.note.${state}`, LINK_NOTES[state])
  const note = <p data-short-link-note="" role="status" className={words ? 'text-xs text-a-text-2' : 'sr-only'}>{words}</p>
  if (!link) return note
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.links.${key}`, english, vars)
  const bars = barsOf(link.days)
  return (
    <div data-short-link="" className="space-y-2 rounded-lg border border-a-border bg-a-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-a-text-2">{w('short', 'Short link')}</span>
        <span className={`min-w-0 break-all font-a-mono text-sm ${link.on ? 'text-a-text' : 'text-a-text-2'}`}>{link.short_url}</span>
        {link.on
          ? <CopyButton text={link.short_url} label={w('copy', 'Copy')} />
          : <span className="text-xs font-medium text-a-text-2">{`(${w('off_badge', 'switched off')})`}</span>}
      </div>
      {note}
      <p className="text-sm text-a-text">
        {w('clicks', 'Clicks: {{count}}', { count: link.clicks })}
        <span className="text-a-text-2">{` · ${w('from_bio', 'From the link-in-bio page: {{count}}', { count: link.clicks_bio })}`}</span>
      </p>
      <figure className="space-y-1">
        <figcaption className="text-xs text-a-text-2">{w('days', 'Clicks per day, last 14 days')}</figcaption>
        <ul className="flex h-12 items-end gap-1">
          {bars.map(bar => (
            <li key={bar.day} className="flex h-full flex-1 flex-col justify-end">
              <span aria-hidden className={`block w-full rounded-sm ${bar.height > 0 ? 'bg-a-accent' : 'h-px bg-a-border'}`}
                style={bar.height > 0 ? { height: `${bar.height}%` } : undefined} />
              <span className="sr-only">{w('bar', '{{day}}: {{count}}', { day: formatDate(bar.day, locale, { day: 'numeric', month: 'short' }), count: bar.clicks })}</span>
            </li>
          ))}
        </ul>
      </figure>
    </div>
  )
}
