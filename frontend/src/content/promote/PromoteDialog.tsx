import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import type { Platform, PromotionBody, SitePage } from '../lib/types'
import { Dialog } from '../../workspace/ui/Dialog'
import { PlatformMark } from '../ui/PlatformMark'
import {
  DEFAULT_PER_PAGE, DEFAULT_PER_WEEK, MAX_PER_PAGE, MAX_PER_WEEK, PROBLEM_TEXT, askPreview, bioNote, catchUp, defaultPeriod, newForm, previewBody, previewLine, promotablePlatforms,
  promoteProblems, promotionBody, retyping, shownProblems, type PromoteForm,
} from './promoteMath'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'
const SHOWN = 5

/** The value once it has stopped changing for `ms` (the first value at once). */
function useSettled(value: string, ms: number): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (value === settled) return
    const timer = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, settled, ms])
  return settled
}

/**
 * Promote… (spec 2026-10-20 §4.2): posts per page, channels, the period, the pace, the picture and instructions; under
 * them the server's preview (no AI, nothing written) says the posts and their days, or how many fit. Promote is on only
 * when they all fit. The period follows the numbers until the manager changes a date.
 */
export function PromoteDialog({ pages, onClose, onStarted }: { pages: SitePage[]; onClose: () => void; onStarted: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const brand = useBrandId()
  const boot = useBoot()
  const queryClient = useQueryClient()
  const today = boot.venue.today
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  const channels = useMemo(() => promotablePlatforms(brandInfo.data?.channels ?? []), [brandInfo.data])
  const bio = useQuery({ queryKey: ['content', brand, 'bio'], queryFn: api.bio, staleTime: 60_000 })
  const [form, setForm] = useState<PromoteForm>(() => newForm(today, pages.length, []))
  // The numbers as typed: a field cleared to type another stays empty, not 0, and says nothing while the keyboard is in
  // it; left empty, it says its problem (final review, 6-2; fixes-batch review).
  const [typed, setTyped] = useState(() => ({ perPage: String(form.perPage), perWeek: String(form.perWeek) }))
  const [editing, setEditing] = useState<'perPage' | 'perWeek' | null>(null)
  const [off, setOff] = useState<Platform[]>([])
  const [datesTouched, setDatesTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current: PromoteForm = { ...form, platforms: channels.filter(p => !off.includes(p)) }
  const problems = promoteProblems(pages.length, current, today)
  const shown = shownProblems(problems, retyping(typed, editing))
  const body = promotionBody(pages.map(p => p.id), current)
  // The preview is asked only what decides the days, once the numbers and dates have settled for 300 ms; while a new
  // answer comes, the last one stays and Promote waits (final review, 6-2: one request per keystroke hit the throttle).
  const previewKey = JSON.stringify(previewBody(pages.map(p => p.id), current))
  const settledKey = useSettled(previewKey, 300)
  const preview = useQuery({
    queryKey: ['content', brand, 'promotion-preview', settledKey],
    queryFn: () => api.previewPromotion(JSON.parse(settledKey) as PromotionBody),
    enabled: askPreview(problems, settledKey, previewKey),
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const fresh = !preview.isPlaceholderData && settledKey === previewKey
  const words = preview.data && fresh ? previewLine(preview.data, t, locale) : null
  const previewError = preview.error ? errorKey('promote', failureOf(preview.error).code) : null

  /** A number changed: the period follows it until a date is changed by hand. */
  const numbers = (next: Partial<PromoteForm>) => setForm(f => {
    const merged = { ...f, ...next }
    if (datesTouched) return merged
    const { from, to } = defaultPeriod(today, pages.length * (merged.perPage || DEFAULT_PER_PAGE), merged.perWeek || DEFAULT_PER_WEEK)
    return { ...merged, from, to }
  })

  const submit = async () => {
    if (busy || problems.length > 0 || !words?.fits) return
    setBusy(true)
    setError(null)
    try {
      const run = await api.promote(body)
      queryClient.setQueryData(['content', brand, 'promotion'], run)
      if (run.status === 'finished') {
        void refreshLists(queryClient, brand)
        void queryClient.invalidateQueries({ queryKey: ['content', brand, 'site'] })
      }
      onStarted()
    } catch (e) {
      const code = failureOf(e).code
      const [key, text] = errorKey('promote', code)
      setError(t(key, text))
      // Another tab is scanning or promoting: catch up, so the page shows it and follows it.
      for (const read of catchUp(code)) void queryClient.invalidateQueries({ queryKey: ['content', brand, read] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('content.promote.dialog.title', 'Promote pages')} onClose={onClose} busy={busy}>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-a-text">{t('content.promote.dialog.pages', 'Pages chosen: {{count}}', { count: pages.length })}</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-a-text-2">
            {pages.slice(0, SHOWN).map(p => <li key={p.id} className="break-words">{p.title}</li>)}
          </ul>
          {pages.length > SHOWN && <p className="mt-1 text-xs text-a-text-2">{t('content.promote.dialog.more', 'More: {{count}}', { count: pages.length - SHOWN })}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('content.promote.dialog.per_page', 'Posts per page')}>
            <input type="number" min={1} max={MAX_PER_PAGE} value={typed.perPage} className={INPUT}
              onFocus={() => setEditing('perPage')} onBlur={() => setEditing(null)}
              onChange={(e) => { const text = e.target.value; setTyped(s => ({ ...s, perPage: text })); numbers({ perPage: Number(text) }) }} />
          </Field>
          <Field label={t('content.promote.dialog.per_week', 'At most per week')}>
            <input type="number" min={1} max={MAX_PER_WEEK} value={typed.perWeek} className={INPUT}
              onFocus={() => setEditing('perWeek')} onBlur={() => setEditing(null)}
              onChange={(e) => { const text = e.target.value; setTyped(s => ({ ...s, perWeek: text })); numbers({ perWeek: Number(text) }) }} />
          </Field>
        </div>
        {brandInfo.data && channels.length === 0 ? (
          <Notice tone="warning">{t('content.promote.dialog.no_channels', 'This brand has no active channel to post on. Add one on the Brand page.')}</Notice>
        ) : (
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-a-text-2">{t('content.promote.dialog.channels', 'Channels')}</legend>
            {/* Not a bare heading while the brand loads (release check, 6-2). */}
            {!brandInfo.data ? (
              brandInfo.isError
                ? <p className="text-sm text-a-danger">{t('content.common.error', 'Something went wrong. Please try again.')}</p>
                : <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {channels.map(p => (
                  <label key={p} className="inline-flex items-center gap-1.5 text-sm text-a-text">
                    <input type="checkbox" checked={!off.includes(p)} onChange={() => setOff(o => (o.includes(p) ? o.filter(x => x !== p) : [...o, p]))} />
                    <PlatformMark platform={p} size="sm" />{t(`content.platform.${p}`, p)}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}
        {bioNote(current.platforms, bio.data) && (
          <Notice tone="info">{t('content.promote.dialog.bio_note', 'Instagram and TikTok can’t open links in posts, so these posts say “link in bio”. On the Brand page, turn on Link-in-bio with “Show the latest posts that have a link”: each post’s link appears there once it is published.')}</Notice>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('content.promote.dialog.from', 'From')}>
            <input type="date" value={form.from} min={today} onChange={(e) => { setDatesTouched(true); setForm(f => ({ ...f, from: e.target.value })) }} className={INPUT} />
          </Field>
          <Field label={t('content.promote.dialog.to', 'To')}>
            <input type="date" value={form.to} min={form.from} onChange={(e) => { setDatesTouched(true); setForm(f => ({ ...f, to: e.target.value })) }} className={INPUT} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-a-text">
          <input type="checkbox" checked={form.usePicture} onChange={(e) => setForm(f => ({ ...f, usePicture: e.target.checked }))} />{t('content.promote.dialog.picture', 'Use the page’s picture')}
        </label>
        <Field label={t('content.promote.dialog.instructions', 'Instructions for the AI (optional)')}>
          <textarea value={form.instructions} onChange={(e) => setForm(f => ({ ...f, instructions: e.target.value }))} rows={3} maxLength={2000} className={INPUT} />
        </Field>
        {shown.length > 0 && channels.length > 0 && (
          <ul className="space-y-1 text-xs text-a-danger">
            {shown.map(p => <li key={p}>{t(`content.promote.dialog.problem.${p}`, PROBLEM_TEXT[p])}</li>)}
          </ul>
        )}
        {problems.length === 0 && (preview.isFetching || !fresh) && !words && <p role="status" className="text-sm text-a-text-2">{t('content.promote.dialog.checking', 'Checking the days…')}</p>}
        {words && <Notice tone={words.fits ? 'info' : 'warning'}>{words.text}</Notice>}
        {previewError && <Notice tone="danger">{t(previewError[0], previewError[1])}</Notice>}
        <p className="text-xs text-a-text-2">{t('content.promote.dialog.drafts_note', 'The posts land on your plan as drafts. You can change, move or delete each one.')}</p>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{t('content.common.cancel', 'Cancel')}</Button>
          <Button type="button" onClick={() => { void submit() }} loading={busy} disabled={problems.length > 0 || !words?.fits}>{t('content.promote.dialog.submit', 'Promote')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
