import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { DateKey, GenerateResult, GenerateRun, Platform } from '../lib/types'
import { Dialog } from '../ui/Dialog'
import { PlatformMark } from '../ui/PlatformMark'
import { PRESET_TEXT, PRESETS, PROBLEM_TEXT, presetRange, rangeProblem, type Preset } from './generateMath'
import { isRunning, runEnded, runWhy, useGenerationRun } from './generateRun'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Generate (spec §4.2, managers): the AI writes drafts for a week, the next
 * week, the month or a range of up to 62 days, on the brand's active
 * channels, empty slots only by default. The answer says how many it wrote
 * and which days it could not; the plan is read again either way.
 */
export function GenerateDialog({ today, onClose, onDone }: { today: DateKey; onClose: () => void; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const brand = useBrandId()
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  const channels = useMemo(() => [...new Set((brandInfo.data?.channels ?? []).filter(c => c.active).map(c => c.platform))], [brandInfo.data])
  const [preset, setPreset] = useState<Preset>('this_week')
  const [custom, setCustom] = useState(() => presetRange('this_week', today))
  const [off, setOff] = useState<Platform[]>([])
  const [emptyOnly, setEmptyOnly] = useState(true)
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The run on the queue worker (2026-10-20), shared with the Plan: while it runs, the dialog says so; when a run it saw
  // running ends, it shows the result and the plan is read again.
  const queryClient = useQueryClient()
  const run = useGenerationRun()
  const seen = useRef<GenerateRun | undefined>(run.data)
  useEffect(() => {
    if (runEnded(seen.current, run.data)) {
      setResult(run.data)
      onDone()
    }
    seen.current = run.data
  }, [run.data, onDone])

  const range = preset === 'custom' ? custom : presetRange(preset, today)
  const problem = rangeProblem(range.from, range.to, today)
  const chosen = channels.filter(p => !off.includes(p))
  const noneChosen = channels.length > 0 && chosen.length === 0
  const day = (date: DateKey, year = false) => formatDate(date, locale, year ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' })

  const submit = async () => {
    if (problem !== null || noneChosen || busy) return
    setBusy(true)
    setError(null)
    try {
      const answer = await api.generate({
        from: range.from, to: range.to, fill_empty_only: emptyOnly,
        ...(chosen.length > 0 && chosen.length < channels.length ? { platforms: chosen } : {}),
        ...(instructions.trim() !== '' ? { instructions: instructions.trim() } : {}),
      })
      // Running on the worker: the shared query follows it from here. Where the queue is sync, the result is here. A read
      // still on its way (from before the press) must not land over it.
      await queryClient.cancelQueries({ queryKey: ['content', brand, 'generation'] })
      queryClient.setQueryData(['content', brand, 'generation'], answer)
      if (answer.status !== 'running' && answer.status !== 'idle') {
        seen.current = answer
        setResult(answer)
        onDone()
      }
    } catch (e) {
      const code = failureOf(e).code
      const [key, text] = errorKey('generate', code)
      setError(t(key, text))
      // Another tab's run is writing: follow it (the dialog shows it running, the Plan fills in when it ends).
      if (code === 'already_generating') void queryClient.invalidateQueries({ queryKey: ['content', brand, 'generation'] })
      onDone() // any drafts saved before the failure are in the plan: read it again
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const unfilled = result.failed_windows
    return (
      <Dialog title={t('content.generate.title', 'Generate posts')} onClose={onClose}>
        <div className="space-y-3">
          <Notice tone={result.created_count > 0 ? 'success' : 'warning'}>
            {result.created_count > 0
              ? t('content.generate.done', 'Posts written: {{count}}', { count: result.created_count })
              : t('content.generate.none', 'No posts were written.')}
          </Notice>
          {runWhy(result, t) && <p className="text-sm text-a-text-2">{runWhy(result, t)}</p>}
          {unfilled.map(w => (
            <p key={w.start_date} className="text-sm text-a-text-2">
              {t('content.generate.unfilled', '{{from}} – {{to}} could not be written. You can try again.', { from: day(w.start_date), to: day(w.end_date, true) })}
            </p>
          ))}
          <div className="flex justify-end"><Button onClick={onClose}>{t('content.generate.close', 'Close')}</Button></div>
        </div>
      </Dialog>
    )
  }

  if (isRunning(run.data)) {
    return (
      <Dialog title={t('content.generate.title', 'Generate posts')} onClose={onClose}>
        <div className="space-y-3">
          <p role="status" className="flex items-start gap-2 text-sm text-a-text">
            <Loader2 size={16} aria-hidden className="mt-0.5 shrink-0 motion-safe:animate-spin" />
            <span>{t('content.generate.running', 'The AI is writing your posts. This can take a minute or two — you can close this window: the plan fills in when they are ready.')}</span>
          </p>
          <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t('content.generate.close', 'Close')}</Button></div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title={t('content.generate.title', 'Generate posts')} onClose={onClose} busy={busy}>
      <p className="mb-4 text-sm text-a-text-2">{t('content.generate.intro', 'The AI writes drafts for the days your channels expect. You can change every one.')}</p>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-xs font-medium text-a-text-2">{t('content.generate.range', 'Days')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button key={p} type="button" aria-pressed={preset === p} onClick={() => setPreset(p)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${preset === p ? 'border-a-accent-text bg-a-surface-2 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
              {t(`content.generate.preset.${p}`, PRESET_TEXT[p])}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label={t('content.generate.from', 'From')}>
              <input type="date" value={custom.from} onChange={(e) => setCustom(c => ({ ...c, from: e.target.value }))} className={INPUT} />
            </Field>
            <Field label={t('content.generate.to', 'To')}>
              <input type="date" value={custom.to} onChange={(e) => setCustom(c => ({ ...c, to: e.target.value }))} className={INPUT} />
            </Field>
          </div>
        ) : (
          <p className="mt-2 text-sm text-a-text">{day(range.from)} – {day(range.to, true)}</p>
        )}
        {problem !== null && <p className="mt-2 text-xs text-a-danger">{t(`content.generate.problem.${problem}`, PROBLEM_TEXT[problem])}</p>}
      </fieldset>
      {channels.length > 0 && (
        <fieldset className="mb-4">
          <legend className="mb-1.5 text-xs font-medium text-a-text-2">{t('content.generate.platforms', 'Channels')}</legend>
          <div className="flex flex-wrap gap-3">
            {channels.map(p => (
              <label key={p} className="inline-flex items-center gap-1.5 text-sm text-a-text">
                <input type="checkbox" checked={!off.includes(p)} onChange={() => setOff(o => (o.includes(p) ? o.filter(x => x !== p) : [...o, p]))} />
                <PlatformMark platform={p} size="sm" />{t(`content.platform.${p}`, p)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="mb-4 flex items-center gap-2 text-sm text-a-text">
        <input type="checkbox" checked={emptyOnly} onChange={(e) => setEmptyOnly(e.target.checked)} />
        {t('content.generate.empty_only', 'Empty slots only')}
      </label>
      <Field label={t('content.generate.instructions', 'Instructions for the AI (optional)')}>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} maxLength={2000} className={INPUT} />
      </Field>
      {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
      {busy && <p role="status" className="mt-4 text-sm text-a-text-2">{t('content.generate.working', 'Writing your posts. This can take up to four minutes…')}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>{t('content.common.cancel', 'Cancel')}</Button>
        <Button onClick={() => { void submit() }} loading={busy} disabled={problem !== null || noneChosen}>{t('content.generate.submit', 'Generate')}</Button>
      </div>
    </Dialog>
  )
}
