import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Upload } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { Eyebrow, SectionTitle } from '../../workspace/ui/Typography'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, type ApiFailure } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points, when } from '../lib/format'
import { ToneBadge } from '../ui/formParts'
import { importKey, importsKey, membershipApi } from './api'
import { ERRORS } from './errors'
import { batchFrom, importNext, importSearch, importShare, importStep, importTone, isCsv, listActions, tooBig } from './membershipMath'
import type { ImportBatch, ImportPreview, ImportProblem } from './types'
import { IMPORT_KIND_WORDS, IMPORT_STATE_WORDS, wordOf } from './words'

const PATH = '/loyalty/members/import'

/**
 * Import (`/loyalty/members/import`, spec 2026-10-21 release 2 §4.1), a manager's: choose a CSV → the preview (rows,
 * new, already members, the problems, five sample rows) → Import, driven a chunk at a time with its progress and Cancel
 * → the result with every row that was not taken; past imports below. The batch is in the address (`?batch=`), so a
 * reload or another tab finds a run where it stands and can continue it. The accepted columns are the full admin's.
 * Staff who open the address are told it is a manager's (the server refuses anyway).
 */
export function ImportPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const manager = listActions(boot.staff.can).tools

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <Link to="/loyalty" className="inline-flex items-center gap-1 text-sm text-a-text-2 hover:text-a-text">
        <ArrowLeft size={15} aria-hidden />{t('loyalty.member.back', 'All members')}
      </Link>
      <PageHeader stacked title={t('loyalty.membership.import.title', 'Import members')}
        line={t('loyalty.membership.import.line', 'Bring existing customers into the programme from a CSV file, with their points and join dates.')} />
      {manager
        ? <Importer />
        : <div className="max-w-xl"><Notice tone="info">{t('loyalty.membership.import.managers_only', 'Importing members is for an owner or a manager.')}</Notice></div>}
    </div>
  )
}

function Importer() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const batchId = batchFrom(location.search)

  const list = useQuery({ queryKey: importsKey, queryFn: () => membershipApi.imports() })
  const one = useQuery({ queryKey: importKey(batchId ?? 0), queryFn: () => membershipApi.importBatch(batchId ?? 0), enabled: batchId !== null, retry: false })
  const batch = batchId === null ? null : one.data?.batch ?? null
  const [preview, setPreview] = useState<{ id: number; preview: ImportPreview } | null>(null)
  const [driving, setDriving] = useState(false)
  const [stopped, setStopped] = useState<ApiFailure | null>(null)
  /** Open another batch, or none: whatever was driving stops. */
  const leave = (id: number | null) => {
    setDriving(false)
    setStopped(null)
    navigate({ pathname: PATH, search: importSearch(id) })
  }

  const keep = (next: ImportBatch) => client.setQueryData(importKey(next.id), { batch: next })
  const upload = useMutation({
    mutationFn: (file: File) => membershipApi.upload(file),
    onSuccess: (answer) => {
      keep(answer.batch)
      setPreview({ id: answer.batch.id, preview: answer.preview })
      void client.invalidateQueries({ queryKey: importsKey })
      leave(answer.batch.id)
    },
  })
  const run = useMutation({
    mutationFn: (from: ImportBatch) => membershipApi.runImport(from.id, from.processed),
    onSuccess: (answer) => {
      keep(answer.batch)
      if (answer.batch.finished) {
        void client.invalidateQueries({ queryKey: importsKey })
        void client.invalidateQueries({ queryKey: ['loyalty', 'members'] })
        void client.invalidateQueries({ queryKey: ['loyalty', 'bootstrap'] })
      }
    },
    onError: (error) => {
      const failure = failureOf(error)
      setDriving(false)
      setStopped(failure)
      const now = failure.extra.batch as ImportBatch | undefined
      if (now && typeof now === 'object' && 'id' in now) keep(now)
      else void one.refetch()
    },
  })
  const cancel = useMutation({
    mutationFn: (id: number) => membershipApi.cancelImport(id),
    onSuccess: (answer) => { setDriving(false); keep(answer.batch); void client.invalidateQueries({ queryKey: importsKey }) },
  })

  // The driver: the next chunk as soon as the last one answered, until the batch is finished (membershipMath `importNext`).
  const next = importNext(batch, driving, run.isPending)
  const { mutate: runChunk } = run
  useEffect(() => {
    if (next === 'run' && batch) runChunk(batch)
  }, [next, batch, runChunk])

  const start = () => { setStopped(null); setDriving(true) }
  const step = importStep(batch)
  const shownPreview = preview && batch && preview.id === batch.id ? preview.preview : null

  return (
    <div className="space-y-6">
      {batchId !== null && one.isError && (
        <div className="max-w-xl space-y-3">
          <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'import', failureOf(one.error)))}</Notice>
          <Button variant="secondary" onClick={() => leave(null)}>{t('loyalty.membership.import.another', 'Import another file')}</Button>
        </div>
      )}
      {batchId !== null && !batch && !one.isError && <Skeleton className="h-40" />}

      {step === 'choose' && batchId === null && (
        <ChooseFile columns={list.data?.columns ?? []} busy={upload.isPending} failure={upload.isError ? failureOf(upload.error) : null}
          onChoose={(file) => upload.mutate(file)} onReset={() => upload.reset()} />
      )}

      {batch && (
        <BatchPanel batch={batch} step={step} preview={shownPreview} driving={(driving && !batch.finished) || run.isPending} stopped={stopped}
          cancelling={cancel.isPending} cancelFailure={cancel.isError ? failureOf(cancel.error) : null}
          onStart={start} onCancel={() => cancel.mutate(batch.id)} onAnother={() => { setPreview(null); leave(null) }} />
      )}

      <PastImports imports={list.data?.imports ?? null} current={batchId} failure={list.isError ? failureOf(list.error) : null} onOpen={(id) => leave(id)} />
    </div>
  )
}

/** Step one: the file, and the columns an import reads. */
function ChooseFile({ columns, busy, failure, onChoose, onReset }: {
  columns: string[]; busy: boolean; failure: ApiFailure | null; onChoose: (file: File) => void; onReset: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<'type' | 'size' | null>(null)
  const extra: Record<string, string> = failure ? {
    columns: Array.isArray(failure.extra.columns) && failure.extra.columns.length > 0 ? (failure.extra.columns as string[]).slice(0, 8).join(', ') : '—',
    rows: points(Number(failure.extra.file_rows ?? 0), locale), max: points(Number(failure.extra.max_rows ?? 0), locale),
  } : {}

  return (
    <section aria-labelledby="import-choose" className="max-w-2xl space-y-4 rounded-2xl border border-a-border bg-a-surface p-5">
      <SectionTitle><span id="import-choose">{t('loyalty.membership.import.choose_title', 'Choose a CSV file')}</span></SectionTitle>
      <p className="text-sm text-a-text-2">{t('loyalty.membership.import.choose_hint', 'One member per row, the first row naming the columns. Every member needs an email address; nothing is imported until you have seen the preview.')}</p>
      <form className="space-y-3" noValidate onSubmit={(e) => {
        e.preventDefault()
        if (!file) return
        if (!isCsv(file)) { setProblem('type'); return }
        if (tooBig(file)) { setProblem('size'); return }
        onChoose(file)
      }}>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('loyalty.membership.import.file', 'File')}</span>
          <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setProblem(null); onReset() }}
            className="block w-full min-w-0 text-sm text-a-text file:mr-3 file:rounded-full file:border file:border-a-border file:bg-a-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-a-text" />
        </label>
        {problem && <Notice tone="warning">{problem === 'type'
          ? t('loyalty.membership.import.not_csv', 'Choose a CSV file (it ends in .csv).')
          : t('loyalty.membership.import.too_big', 'The file is larger than 20 MB. Split it into smaller files.')}</Notice>}
        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'import', failure), extra)}</Notice>}
        <Button type="submit" disabled={!file} loading={busy}><Upload size={15} aria-hidden />{t('loyalty.membership.import.check', 'Check the file')}</Button>
      </form>
      {columns.length > 0 && (
        <div className="space-y-1.5">
          <Eyebrow>{t('loyalty.membership.import.columns_title', 'Columns it reads')}</Eyebrow>
          <ul data-columns="" className="flex flex-wrap gap-1.5">
            {columns.map(c => <li key={c} className="rounded-full bg-a-surface-2 px-2.5 py-0.5 text-xs text-a-text">{t(...wordOf('import.column', c))}</li>)}
          </ul>
          <p className="text-xs text-a-text-2">{t('loyalty.membership.import.columns_hint', 'Common spellings are understood (“E-mail”, “Surname”, “Balance”…); other columns are left out and named in the preview.')}</p>
          {/* Release 8: a membership's end date, written one way. */}
          {columns.includes('valid_until') && (
            <p data-valid-until-hint="" className="text-xs text-a-text-2">{t('loyalty.membership.import.valid_until_hint', 'Valid until: the last day of each membership, written YYYY-MM-DD (e.g. 2027-10-03). Leave it empty for a membership that never ends.')}</p>
          )}
        </div>
      )}
    </section>
  )
}

/** A batch: its preview before it starts, its progress while it runs, its result once it is finished. */
function BatchPanel({ batch, step, preview, driving, stopped, cancelling, cancelFailure, onStart, onCancel, onAnother }: {
  batch: ImportBatch
  step: 'choose' | 'ready' | 'running' | 'done'
  preview: ImportPreview | null
  driving: boolean
  stopped: ApiFailure | null
  cancelling: boolean
  cancelFailure: ApiFailure | null
  onStart: () => void
  onCancel: () => void
  onAnother: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const share = importShare(batch)
  const n = (value: number) => points(value, locale)

  return (
    <section aria-labelledby="import-batch" data-step={step} className="space-y-4 rounded-2xl border border-a-border bg-a-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <SectionTitle><span id="import-batch" className="break-all">{batch.filename ?? t('loyalty.membership.import.unnamed', 'CSV file')}</span></SectionTitle>
        <ToneBadge tone={importTone(batch.state)}>{t(`loyalty.membership.import.state.${batch.state}`, IMPORT_STATE_WORDS[batch.state] ?? batch.state)}</ToneBadge>
      </div>

      {step === 'ready' && (
        <>
          {preview ? (
            <dl data-preview="" className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Figure label={t('loyalty.membership.import.rows', 'Rows')} value={n(preview.rows)} />
              <Figure label={t('loyalty.membership.import.new', 'New members')} value={n(preview.new)} />
              <Figure label={t('loyalty.membership.import.existing', 'Already members')} value={n(preview.existing)} />
              <Figure label={t('loyalty.membership.import.problems_count', 'Not imported')} value={n(preview.refused + preview.skipped)} />
            </dl>
          ) : (
            <p className="text-sm text-a-text">{t('loyalty.membership.import.ready', '{{rows}} rows are ready to import.', { rows: n(batch.rows) })}</p>
          )}
          {preview && preview.points > 0 && (
            <p className="text-sm text-a-text-2">{t('loyalty.membership.import.points', 'Opening balances: {{points}} points in all, written to each member’s history.', { points: n(preview.points) })}</p>
          )}
          {preview && preview.columns_ignored.length > 0 && (
            <p className="break-words text-sm text-a-text-2">{t('loyalty.membership.import.ignored', 'Left out: {{columns}}.', { columns: preview.columns_ignored.join(', ') })}</p>
          )}
          {preview && preview.sample.length > 0 && (
            <div className="space-y-1.5">
              <Eyebrow>{t('loyalty.membership.import.sample', 'First rows')}</Eyebrow>
              <ul data-sample="" className="divide-y divide-a-border rounded-xl border border-a-border text-sm">
                {preview.sample.map(row => (
                  <li key={row.line} className="flex flex-wrap gap-x-3 px-3 py-2">
                    <span className="text-a-text-2">{t('loyalty.membership.import.line_no', 'Line {{line}}', { line: row.line })}</span>
                    <span className="min-w-0 break-all text-a-text">{row.email}</span>
                    <span className="text-a-text-2">{[row.tier, t('loyalty.common.points_count', '{{points}} pts', { points: n(row.points) })].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview && <Problems problems={preview.problems} title={t('loyalty.membership.import.preview_problems', 'Rows that will not be imported')} />}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onAnother}>{t('loyalty.membership.import.another', 'Import another file')}</Button>
            <Button onClick={onStart} loading={driving}>{t('loyalty.membership.import.start', 'Import')}</Button>
          </div>
        </>
      )}

      {step === 'running' && (
        <>
          <div className="space-y-1.5">
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={batch.progress}
              aria-label={t('loyalty.membership.import.progress_label', 'Import progress')} className="h-2 overflow-hidden rounded-full bg-a-surface-2">
              <div className="h-full rounded-full bg-a-accent" style={{ width: `${batch.progress}%` }} />
            </div>
            <p data-progress="" className="text-sm text-a-text-2">
              {t('loyalty.membership.import.progress', '{{done}} of {{of}} rows · {{created}} members created', { done: n(share.done), of: n(share.of), created: n(batch.created) })}
            </p>
          </div>
          {stopped && <Notice tone="warning">{t(...refusalKey('loyalty.membership', ERRORS, 'import', stopped))}</Notice>}
          {cancelFailure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'import', cancelFailure))}</Notice>}
          {!driving && !stopped && <Notice tone="info">{t('loyalty.membership.import.paused', 'This import is paused. Continue where it stopped, or stop it; members already created stay.')}</Notice>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onCancel} loading={cancelling}>{t('loyalty.membership.import.cancel', 'Stop the import')}</Button>
            {!driving && <Button onClick={onStart}>{t('loyalty.membership.import.continue', 'Continue')}</Button>}
          </div>
        </>
      )}

      {step === 'done' && (
        <>
          {batch.state === 'failed' && (
            <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'import', { status: 0, code: batch.failure ?? 'unknown', extra: {} }))}</Notice>
          )}
          <dl data-result="" className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Figure label={t('loyalty.membership.import.created', 'Members created')} value={n(batch.created)} />
            <Figure label={t('loyalty.membership.import.skipped', 'Passed over')} value={n(batch.skipped)} />
            <Figure label={t('loyalty.membership.import.refused', 'Refused')} value={n(batch.refused)} />
            <Figure label={t('loyalty.membership.import.points_given', 'Points written')} value={n(batch.points)} />
          </dl>
          {batch.state === 'cancelled' && (
            <p className="text-sm text-a-text-2">{t('loyalty.membership.import.stopped_at', 'Stopped after {{done}} of {{of}} rows; the members created before it stopped stay.', { done: n(share.done), of: n(share.of) })}</p>
          )}
          <Problems problems={batch.problems ?? []} title={t('loyalty.membership.import.result_problems', 'Rows that were not imported')} />
          <div className="flex flex-wrap justify-end gap-2">
            <Link to="/loyalty" className="inline-flex items-center rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
              {t('loyalty.membership.import.to_members', 'See the members')}
            </Link>
            <Button onClick={onAnother}>{t('loyalty.membership.import.another', 'Import another file')}</Button>
          </div>
        </>
      )}
    </section>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-a-surface-2 px-3 py-2">
      <dt className="text-xs text-a-text-2">{label}</dt>
      <dd className="font-a-display text-2xl tabular-nums text-a-text">{value}</dd>
    </div>
  )
}

/** The rows not taken, in the workspace's words: the line, the address, passed over or refused, and why. */
function Problems({ problems, title }: { problems: ImportProblem[]; title: string }) {
  const { t } = useTranslation()
  if (problems.length === 0) return null
  return (
    <div className="space-y-1.5">
      <Eyebrow>{title}</Eyebrow>
      <ul data-problems="" className="max-h-80 divide-y divide-a-border overflow-y-auto rounded-xl border border-a-border text-sm">
        {problems.map((p, i) => (
          <li key={`${p.line}-${i}`} data-problem={p.code} className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 py-2">
            <span className="text-a-text-2">{t('loyalty.membership.import.line_no', 'Line {{line}}', { line: p.line })}</span>
            {p.email && <span className="min-w-0 break-all text-a-text">{p.email}</span>}
            <span className="text-a-text-2">{t(`loyalty.membership.import.kind.${p.kind}`, IMPORT_KIND_WORDS[p.kind] ?? p.kind)}: {t(...wordOf('import.problem', p.code), { line: p.first_line ?? '', tier: p.tier ?? '' })}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The latest imports, of every brand; one opens where it stands (a run that was left can be continued). */
function PastImports({ imports, current, failure, onOpen }: { imports: ImportBatch[] | null; current: number | null; failure: ApiFailure | null; onOpen: (id: number) => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  if (failure) return <div className="max-w-xl"><Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'load', failure))}</Notice></div>
  if (!imports || imports.length === 0) return null
  return (
    <section aria-labelledby="import-past" className="space-y-3">
      <SectionTitle><span id="import-past">{t('loyalty.membership.import.past', 'Past imports')}</span></SectionTitle>
      <ul className="divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface">
        {imports.map(b => (
          <li key={b.id} data-batch={b.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 ${b.id === current ? 'bg-a-surface-2' : ''}`}>
            <span className="min-w-0 flex-1">
              <span className="block break-all text-sm font-medium text-a-text">{b.filename ?? t('loyalty.membership.import.unnamed', 'CSV file')}</span>
              <span className="block text-xs text-a-text-2">
                {[when(b.created_at, locale, boot.venue.timezone), b.by,
                  t('loyalty.membership.import.past_counts', '{{created}} created · {{skipped}} passed over · {{refused}} refused', {
                    created: points(b.created, locale), skipped: points(b.skipped, locale), refused: points(b.refused, locale),
                  })].filter(Boolean).join(' · ')}
              </span>
            </span>
            <ToneBadge tone={importTone(b.state)}>{t(`loyalty.membership.import.state.${b.state}`, IMPORT_STATE_WORDS[b.state] ?? b.state)}</ToneBadge>
            {b.id !== current && <Button size="sm" variant="ghost" onClick={() => onOpen(b.id)}>{t('loyalty.membership.import.open', 'Open')}</Button>}
          </li>
        ))}
      </ul>
    </section>
  )
}
