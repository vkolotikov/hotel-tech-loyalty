import type { InboxFilters, InboxRecord, RequestKind } from './types'
import type { useRequestWords } from './words'
import { when } from '../lib/format'

export function recordKey(value: string | null): { selected_kind: RequestKind; selected_id: number } | null {
  const match = /^(benefit|redemption|referral):([1-9]\d*)$/.exec(value ?? '')
  return match && Number.isSafeInteger(Number(match[2])) ? { selected_kind: match[1] as RequestKind, selected_id: Number(match[2]) } : null
}

/** Preserve the old benefit-only tab/request bookmarks while the default becomes the mixed inbox. */
export function inboxFilters(search: string): InboxFilters {
  const p = new URLSearchParams(search)
  const legacy = ['waiting', 'approved', 'done'].includes(p.get('tab') ?? '')
  const type = p.get('type') ?? (legacy || p.has('request') ? 'benefit' : 'all')
  const view = p.get('view') ?? (legacy ? p.get('tab') === 'done' ? 'closed' : p.get('tab')! : 'open')
  const selected = recordKey(p.get('record')) ?? recordKey(p.has('request') ? `benefit:${p.get('request')}` : null)
  return { type: ['benefit', 'redemption', 'referral'].includes(type) ? type as RequestKind : 'all',
    view: ['open', 'closed', 'all', 'waiting', 'approved'].includes(view) ? view as InboxFilters['view'] : 'open',
    q: (p.get('q') ?? '').slice(0, 120), sort: p.get('sort') === 'oldest' ? 'oldest' : 'newest',
    page: Math.max(1, Math.min(1_000_000, Number.parseInt(p.get('page') ?? '1', 10) || 1)), ...selected }
}
export function recordLabel(r: Pick<InboxRecord, 'id' | 'kind'>): string { return `#${{ benefit: 'BR', redemption: 'RR', referral: 'RF' }[r.kind]}-${r.id}` }
export function recordTitle(r: InboxRecord, say: ReturnType<typeof useRequestWords>): string { return r.kind === 'referral' ? say('referralTitle') : r.title || say(r.kind === 'benefit' ? 'unknownBenefit' : 'unknownReward') }
export function recordWhen(at: string | null, locale: string, timeZone: string): string {
  if (!at || !Number.isFinite(Date.parse(at))) return '—'
  try { return new Intl.DateTimeFormat(locale || 'en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(at)) }
  catch { return when(at, locale, timeZone) || '—' }
}
