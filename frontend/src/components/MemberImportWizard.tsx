import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  X, Upload, Download, Loader2, CheckCircle2, AlertTriangle,
  FileSpreadsheet, ArrowRight, Info, XCircle,
} from 'lucide-react'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

/**
 * Guided CSV import for existing customers.
 *
 * Built for an operator migrating a real customer base — thousands of
 * rows, once, under pressure — not for a developer. That drives three
 * things the previous single-button import didn't do:
 *
 *  - It always shows what it understood before writing anything: which
 *    columns it matched, which it ignored, and the exact per-row
 *    verdicts. Silently dropping a column is how a migration goes wrong
 *    in a way nobody notices for a month.
 *  - It runs the work in chunks with a real progress bar. 5 000 members
 *    is ~12 minutes of database work; a spinner on a single request
 *    would time out and leave a partial import nobody can account for.
 *  - Closing the dialog does not abandon the run. Progress lives on the
 *    server, so reopening resumes exactly where it stopped.
 */

interface Props {
  onClose: () => void
}

/** "1 member" / "2 members" — the count is often 1 on a re-run. */
function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
}

/** Pull the server's message out of an axios error without widening to `any`. */
function apiError(e: unknown, fallback: string): string {
  const res = (e as { response?: { data?: { error?: string; message?: string } } })?.response
  return res?.data?.error || res?.data?.message || fallback
}

type Phase = 'choose' | 'review' | 'running' | 'done'

interface Batch {
  uuid: string
  filename?: string
  status: string
  is_finished: boolean
  file_rows: number
  total_rows: number
  processed: number
  remaining: number
  progress: number
  ok: number
  skip: number
  error: number
  points_awarded: number
  columns_used?: string[]
  columns_ignored?: string[]
  error_message?: string
  problems?: Array<{ line: number; email?: string; status?: string; reason?: string }>
}

interface Preview {
  will_create: number
  will_skip: number
  will_error: number
  points_to_award: number
  file_rows: number
  columns_used: string[]
  columns_ignored: string[]
  problems: Array<{ line: number; email?: string; status?: string; reason?: string }>
  sample: Array<{ line: number; email: string; tier?: string; points?: number }>
  plan_limit?: { count: number; limit: number | null }
}

/** Human labels for the canonical column names the parser reports. */
const COLUMN_LABELS: Record<string, string> = {
  name: 'Name',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  tier_name: 'Tier',
  points: 'Points balance',
  lifetime_points: 'Lifetime points',
  joined_at: 'Member since',
  date_of_birth: 'Date of birth',
  marketing_consent: 'Marketing consent',
  external_id: 'Your reference',
}

export function MemberImportWizard({ onClose }: Props) {
  const qc = useQueryClient()
  const [phase, setPhase] = useState<Phase>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Lets the chunk loop stop when the operator cancels. A ref, not
  // state, because the loop reads it between awaits.
  const stopped = useRef(false)
  useEffect(() => () => { stopped.current = true }, [])

  const uploadAndPreview = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/v1/admin/members/imports/preview', fd)
      setPreview(data.preview)
      setBatch(data.batch)
      setPhase('review')
    } catch (e: unknown) {
      setError(apiError(e, 'Could not read that file.'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Drive the import to completion, one chunk per request.
   *
   * Each call returns authoritative progress from the server, so this
   * loop holds no state worth losing — a refresh mid-import can pick the
   * same batch back up.
   */
  const runChunks = async (uuid: string) => {
    stopped.current = false
    setPhase('running')
    setError(null)

    for (;;) {
      if (stopped.current) return
      try {
        const { data } = await api.post(`/v1/admin/members/imports/${uuid}/process`, null, {
          params: { size: 100 },
          timeout: 180000,
        })
        const b: Batch = data.batch
        setBatch(b)

        if (b.is_finished) {
          setPhase('done')
          qc.invalidateQueries({ queryKey: ['admin-members'] })
          qc.invalidateQueries({ queryKey: ['admin-members-stats'] })
          if (b.status === 'completed') {
            toast.success(`Imported ${plural(b.ok, 'member')}`)
          }
          return
        }
      } catch (e: unknown) {
        // Keep the batch — the server knows how far it got, so the
        // operator can retry from here instead of starting over.
        setError(apiError(e, 'The import stopped. Press Resume to continue where it left off.'))
        setPhase('review')
        return
      }
    }
  }

  const cancelRun = async () => {
    stopped.current = true
    if (batch) {
      try {
        const { data } = await api.post(`/v1/admin/members/imports/${batch.uuid}/cancel`)
        setBatch(data.batch)
      } catch { /* the run is already stopped client-side */ }
    }
    setPhase('done')
    qc.invalidateQueries({ queryKey: ['admin-members'] })
  }

  const downloadTemplate = () => {
    const csv = [
      'name,email,phone,tier_name,points,lifetime_points,joined_at,marketing_consent',
      'Rita Ozola,rita@example.com,+37126123456,Gold,2400,5200,2019-04-02,yes',
      'John Smith,john@example.com,+15551234567,Bronze,150,150,2023-11-18,no',
    ].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'members-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadProblems = () => {
    const rows = (batch?.problems ?? preview?.problems ?? [])
    const csv = ['line,email,status,reason']
      .concat(rows.map(r => `${r.line},"${r.email ?? ''}",${r.status ?? 'error'},"${(r.reason ?? '').replace(/"/g, '""')}"`))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'import-problems.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const canClose = phase !== 'running'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-3xl max-h-[92vh] flex flex-col">

        <header className="flex items-center justify-between p-5 border-b border-dark-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-500/15 flex items-center justify-center">
              <FileSpreadsheet size={18} className="text-primary-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Import members</h2>
              <p className="text-[11px] text-t-secondary">
                {phase === 'choose'  && 'Bring your existing customers across'}
                {phase === 'review'  && 'Check what we found before importing'}
                {phase === 'running' && 'Importing — you can leave this open'}
                {phase === 'done'    && 'Import finished'}
              </p>
            </div>
          </div>
          <button
            onClick={canClose ? onClose : undefined}
            disabled={!canClose}
            aria-label="Close"
            className="text-t-secondary hover:text-white disabled:opacity-30"
          >
            <X size={20} />
          </button>
        </header>

        <Steps phase={phase} />

        <div className="p-5 overflow-y-auto grow space-y-4">
          {error && (
            <div className="flex gap-2 rounded-lg border border-error/40 bg-error/10 p-3 text-xs text-error">
              <AlertTriangle size={15} className="shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          {phase === 'choose' && (
            <ChooseStep file={file} onFile={setFile} onTemplate={downloadTemplate} />
          )}

          {phase === 'review' && preview && (
            <ReviewStep preview={preview} onDownloadProblems={downloadProblems} />
          )}

          {(phase === 'running' || phase === 'done') && batch && (
            <ProgressStep batch={batch} onDownloadProblems={downloadProblems} />
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 p-5 border-t border-dark-border shrink-0">
          <div className="text-[11px] text-t-secondary hidden sm:block">
            {phase === 'review' && preview && (
              <>Nothing has been created yet.</>
            )}
            {phase === 'running' && (
              <>Safe to close — the import keeps its place and resumes.</>
            )}
          </div>

          <div className="flex gap-2">
            {phase === 'choose' && (
              <>
                <button onClick={onClose} className="px-3 py-1.5 text-sm text-t-secondary hover:text-white">Cancel</button>
                <button
                  onClick={uploadAndPreview}
                  disabled={!file || busy}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  Check file
                </button>
              </>
            )}

            {phase === 'review' && (
              <>
                <button
                  onClick={() => { setPhase('choose'); setPreview(null); setBatch(null) }}
                  className="px-3 py-1.5 text-sm text-t-secondary hover:text-white"
                >
                  Choose another file
                </button>
                <button
                  onClick={() => batch && runChunks(batch.uuid)}
                  disabled={!batch || !preview || preview.will_create === 0}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
                >
                  <Upload size={14} />
                  {batch && batch.processed > 0
                    ? `Resume — ${batch.remaining.toLocaleString()} left`
                    : `Import ${plural(preview?.will_create ?? 0, 'member')}`}
                </button>
              </>
            )}

            {phase === 'running' && (
              <button onClick={cancelRun} className="px-3 py-1.5 text-sm text-error hover:text-error/80">
                Stop
              </button>
            )}

            {phase === 'done' && (
              <button onClick={onClose} className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                Done
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

function Steps({ phase }: { phase: Phase }) {
  const steps: Array<{ key: Phase; label: string }> = [
    { key: 'choose',  label: 'Choose file' },
    { key: 'review',  label: 'Review' },
    { key: 'running', label: 'Import' },
    { key: 'done',    label: 'Finished' },
  ]
  const activeIndex = steps.findIndex(s => s.key === phase)

  return (
    <div className="flex items-center gap-1 px-5 py-3 border-b border-dark-border shrink-0">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1 flex-1 last:flex-none">
          <div className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
              i < activeIndex ? 'bg-accent/20 text-accent'
              : i === activeIndex ? 'bg-primary-500 text-white'
              : 'bg-dark-surface3 text-t-secondary'
            }`}>
              {i < activeIndex ? <CheckCircle2 size={12} /> : i + 1}
            </span>
            <span className={`text-[11px] font-medium ${i <= activeIndex ? 'text-white' : 'text-t-secondary'}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && <div className={`h-px flex-1 mx-2 ${i < activeIndex ? 'bg-accent/40' : 'bg-dark-border'}`} />}
        </div>
      ))}
    </div>
  )
}

function ChooseStep({ file, onFile, onTemplate }: {
  file: File | null
  onFile: (f: File | null) => void
  onTemplate: () => void
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <div className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          file ? 'border-primary-500/50 bg-primary-500/5' : 'border-dark-border2 hover:border-dark-border2/80 hover:bg-white/[0.02]'
        }`}>
          <Upload size={22} className={`mx-auto mb-2 ${file ? 'text-primary-400' : 'text-t-secondary'}`} />
          {file ? (
            <>
              <p className="text-sm font-semibold text-white">{file.name}</p>
              <p className="text-[11px] text-t-secondary mt-0.5">{(file.size / 1024).toFixed(0)} KB — click to choose a different file</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-white">Choose a CSV file</p>
              <p className="text-[11px] text-t-secondary mt-0.5">Exported from your current system, or from Excel</p>
            </>
          )}
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={e => onFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </label>

      <div className="rounded-lg border border-dark-border bg-dark-surface2 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Info size={14} className="text-info shrink-0 mt-0.5" />
          <div className="text-xs text-t-secondary leading-relaxed">
            <p className="text-white font-medium mb-1">Only an email column is required.</p>
            <p>
              Everything else is optional. Column names don't need to match exactly —
              "E-Mail Address", "Mobile Number" and "Member Since" are all understood.
              Semicolon files and Excel's "CSV UTF-8" work as-is.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Object.values(COLUMN_LABELS).map(label => (
            <span key={label} className="text-[10px] px-2 py-0.5 rounded-full bg-dark-surface3 text-t-secondary border border-dark-border">
              {label}
            </span>
          ))}
        </div>

        <button
          onClick={onTemplate}
          className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 font-medium"
        >
          <Download size={12} /> Download an example file
        </button>
      </div>

      <p className="text-[11px] text-t-secondary">
        Existing customers keep their history: include a points balance, lifetime
        total and join date and they come across with a full transaction record.
        Anyone already on file is skipped, so re-running the same file is safe.
      </p>
    </div>
  )
}

function ReviewStep({ preview, onDownloadProblems }: { preview: Preview; onDownloadProblems: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Will be created" value={preview.will_create} tone="good" />
        {/* Covers both "already a member" and "repeated inside this file" —
            the old "Already on file" wording was wrong for the second. */}
        <Tile label="Will be skipped" value={preview.will_skip} tone="warn" hint="Existing or repeated" />
        <Tile label="Need attention" value={preview.will_error} tone={preview.will_error > 0 ? 'bad' : 'muted'} />
      </div>

      {preview.points_to_award > 0 && (
        <p className="text-xs text-t-secondary">
          <span className="text-white font-semibold">{preview.points_to_award.toLocaleString()}</span> points
          will be credited as opening balances, each with a full transaction record.
        </p>
      )}

      <div className="rounded-lg border border-dark-border bg-dark-surface2 p-4 space-y-3">
        <div>
          <p className="text-[11px] font-semibold text-t-secondary uppercase tracking-wider mb-1.5">Columns we're using</p>
          <div className="flex flex-wrap gap-1.5">
            {preview.columns_used.map(c => (
              <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
                {COLUMN_LABELS[c] ?? c}
              </span>
            ))}
          </div>
        </div>

        {preview.columns_ignored.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-t-secondary uppercase tracking-wider mb-1.5">
              Columns we're ignoring
            </p>
            <div className="flex flex-wrap gap-1.5">
              {preview.columns_ignored.map(c => (
                <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-dark-surface3 text-t-secondary border border-dark-border">
                  {c}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-t-secondary mt-1.5">
              These aren't fields we store. Rename a column if one of them should have been matched.
            </p>
          </div>
        )}
      </div>

      {preview.sample.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-t-secondary uppercase tracking-wider mb-1.5">First few rows</p>
          <div className="rounded-lg border border-dark-border overflow-hidden">
            {preview.sample.map(r => (
              <div key={r.line} className="flex items-center gap-3 px-3 py-1.5 text-xs border-b border-dark-border last:border-0">
                <span className="text-t-secondary w-10 shrink-0 tabular-nums">L{r.line}</span>
                <span className="text-white truncate flex-1">{r.email}</span>
                {r.tier && <span className="text-primary-400 shrink-0">{r.tier}</span>}
                {!!r.points && <span className="text-t-secondary tabular-nums shrink-0">{r.points.toLocaleString()} pts</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <ProblemList problems={preview.problems} onDownload={onDownloadProblems} />

      {preview.plan_limit?.limit != null && (
        <p className="text-[11px] text-t-secondary">
          Plan usage: {preview.plan_limit.count.toLocaleString()} of {preview.plan_limit.limit.toLocaleString()} member slots.
        </p>
      )}
    </div>
  )
}

function ProgressStep({ batch, onDownloadProblems }: { batch: Batch; onDownloadProblems: () => void }) {
  const done = batch.is_finished
  const cancelled = batch.status === 'cancelled'

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm font-semibold text-white">
            {done
              ? (cancelled ? 'Stopped' : 'Finished')
              : `Importing… ${batch.processed.toLocaleString()} of ${batch.total_rows.toLocaleString()}`}
          </span>
          <span className="text-sm font-bold text-primary-400 tabular-nums">{batch.progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-dark-surface3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cancelled ? 'bg-warning' : done ? 'bg-accent' : 'bg-primary-500'}`}
            style={{ width: `${Math.max(batch.progress, 2)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Created" value={batch.ok} tone="good" />
        <Tile label="Skipped" value={batch.skip} tone="warn" />
        <Tile label="Failed" value={batch.error} tone={batch.error > 0 ? 'bad' : 'muted'} />
      </div>

      {done && !cancelled && batch.error === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          <CheckCircle2 size={15} className="shrink-0" />
          <span>
            All {plural(batch.ok, 'member')} imported
            {batch.points_awarded > 0 && <> with {batch.points_awarded.toLocaleString()} points credited</>}.
          </span>
        </div>
      )}

      {cancelled && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle size={15} className="shrink-0" />
          <span>
            Stopped after {plural(batch.ok, 'member')}. The ones already created are
            kept — re-upload the same file to bring across the rest.
          </span>
        </div>
      )}

      {batch.error_message && (
        <div className="flex gap-2 rounded-lg border border-error/40 bg-error/10 p-3 text-xs text-error">
          <XCircle size={15} className="shrink-0 mt-px" />
          <span>{batch.error_message}</span>
        </div>
      )}

      <ProblemList problems={batch.problems ?? []} onDownload={onDownloadProblems} />
    </div>
  )
}

function ProblemList({ problems, onDownload }: {
  problems: Array<{ line: number; email?: string; status?: string; reason?: string }>
  onDownload: () => void
}) {
  if (!problems.length) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold text-t-secondary uppercase tracking-wider">
          Rows needing attention
        </p>
        <button onClick={onDownload} className="flex items-center gap-1 text-[11px] text-primary-400 hover:text-primary-300">
          <Download size={11} /> Download list
        </button>
      </div>
      {/* Stacks below `sm`. Fixed column widths pushed the reason — the
          only part that tells the operator what to fix — off the right
          edge behind a horizontal scrollbar on a phone. */}
      <div className="rounded-lg border border-dark-border max-h-56 overflow-y-auto">
        {problems.slice(0, 100).map((r, i) => (
          <div
            key={`${r.line}-${i}`}
            className="px-3 py-1.5 text-xs border-b border-dark-border last:border-0
                       sm:flex sm:items-start sm:gap-3"
          >
            <div className="flex items-center gap-2 sm:contents">
              <span className="text-t-secondary shrink-0 tabular-nums sm:w-10">L{r.line}</span>
              <span className={`shrink-0 font-medium sm:w-12 ${r.status === 'skip' ? 'text-warning' : 'text-error'}`}>
                {r.status === 'skip' ? 'Skip' : 'Error'}
              </span>
              <span className="text-white truncate min-w-0 sm:w-48 sm:shrink-0">{r.email || '—'}</span>
            </div>
            <span className="block text-t-secondary sm:min-w-0">{r.reason}</span>
          </div>
        ))}
        {problems.length > 100 && (
          <div className="px-3 py-1.5 text-[11px] text-t-secondary">
            + {(problems.length - 100).toLocaleString()} more — download the list to see them all
          </div>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, tone, hint }: {
  label: string
  value: number
  tone: 'good' | 'warn' | 'bad' | 'muted'
  hint?: string
}) {
  const toneClass = {
    good:  'text-accent',
    warn:  'text-warning',
    bad:   'text-error',
    muted: 'text-t-secondary',
  }[tone]

  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface2 p-3">
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value.toLocaleString()}</p>
      <p className="text-[11px] text-t-secondary mt-0.5">{label}</p>
      {hint && <p className="text-[10px] text-t-secondary/70">{hint}</p>}
    </div>
  )
}
