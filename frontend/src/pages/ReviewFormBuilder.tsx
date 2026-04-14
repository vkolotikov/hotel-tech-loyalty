import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, Save, Plus, Trash2, GripVertical, Copy, RefreshCw } from 'lucide-react'
import { api, API_URL } from '../lib/api'

type Kind = 'text' | 'textarea' | 'stars' | 'scale' | 'nps' | 'single_choice' | 'multi_choice' | 'boolean'

interface Question {
  id?: number
  kind: Kind
  label: string
  help_text?: string
  options?: { choices?: string[]; min?: number; max?: number }
  required: boolean
  weight: number
}

interface Form {
  id: number
  name: string
  type: 'basic' | 'custom'
  is_active: boolean
  is_default: boolean
  embed_key: string
  config: Record<string, any>
  questions: Question[]
}

const KIND_LABELS: Record<Kind, string> = {
  text: 'Short Text',
  textarea: 'Long Text',
  stars: 'Star Rating',
  scale: 'Scale (1-10)',
  nps: 'NPS (0-10)',
  single_choice: 'Single Choice',
  multi_choice: 'Multi Choice',
  boolean: 'Yes / No',
}

export function ReviewFormBuilder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<{ form: Form }>({
    queryKey: ['review-form', id],
    queryFn: () => api.get(`/v1/admin/reviews/forms/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const [name, setName] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isDefault, setIsDefault] = useState(false)
  const [config, setConfig] = useState<Record<string, any>>({})
  const [questions, setQuestions] = useState<Question[]>([])

  useEffect(() => {
    if (data?.form) {
      setName(data.form.name)
      setIsActive(data.form.is_active)
      setIsDefault(data.form.is_default)
      setConfig(data.form.config ?? {})
      setQuestions(data.form.questions ?? [])
    }
  }, [data])

  const form = data?.form
  const publicUrl = form ? `${API_URL}/review/${form.id}?key=${form.embed_key}` : ''

  const saveFormMut = useMutation({
    mutationFn: () => api.put(`/v1/admin/reviews/forms/${id}`, {
      name, is_active: isActive, is_default: isDefault, config,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-form', id] })
      qc.invalidateQueries({ queryKey: ['review-forms'] })
      toast.success('Settings saved')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const saveQuestionsMut = useMutation({
    mutationFn: () => api.put(`/v1/admin/reviews/forms/${id}/questions`, {
      questions: questions.map(q => ({
        kind: q.kind,
        label: q.label,
        help_text: q.help_text ?? null,
        options: q.options ?? null,
        required: q.required,
        weight: q.weight,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-form', id] })
      toast.success('Questions saved')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const rotateKeyMut = useMutation({
    mutationFn: () => api.post(`/v1/admin/reviews/forms/${id}/rotate-key`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['review-form', id] })
      qc.invalidateQueries({ queryKey: ['review-forms'] })
      toast.success('Embed key rotated')
    },
  })

  if (isLoading || !form) {
    return <div className="p-8 text-[#a0a0a0]">Loading…</div>
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <button
        onClick={() => navigate('/reviews')}
        className="flex items-center gap-2 text-[#a0a0a0] hover:text-white text-sm mb-4"
      >
        <ArrowLeft size={16} /> Back to reviews
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-transparent text-2xl font-bold text-white focus:outline-none w-full"
          />
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-[#1e1e1e] text-[#a0a0a0] uppercase tracking-wider">{form.type}</span>
            {form.is_default && <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 uppercase tracking-wider">Default</span>}
          </div>
        </div>
      </div>

      {/* Public URL */}
      <div className="bg-dark-surface border border-dark-border rounded-xl p-4 mb-6">
        <div className="text-[#a0a0a0] text-xs uppercase tracking-wider mb-2">Public URL</div>
        <div className="flex items-center gap-2">
          <input readOnly value={publicUrl} className="flex-1 bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-xs text-white font-mono" />
          <button onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Copied') }} className="border border-dark-border text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-dark-surface2">
            <Copy size={14} />
          </button>
          <button onClick={() => confirm('Rotating invalidates every existing shared link. Continue?') && rotateKeyMut.mutate()} className="border border-dark-border text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-dark-surface2" title="Rotate embed key">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-dark-surface border border-dark-border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Intro text">
            <textarea value={config.intro_text ?? ''} onChange={e => setConfig({ ...config, intro_text: e.target.value })} rows={2} className={inputCls} />
          </Field>
          <Field label="Thank you text">
            <textarea value={config.thank_you_text ?? ''} onChange={e => setConfig({ ...config, thank_you_text: e.target.value })} rows={2} className={inputCls} />
          </Field>
          <Checkbox label="Allow anonymous submissions" checked={!!config.allow_anonymous} onChange={v => setConfig({ ...config, allow_anonymous: v })} />
          <Checkbox label="Form is active" checked={isActive} onChange={setIsActive} />
          {!form.is_default && (
            <Checkbox label="Set as default (used for post-stay auto-invitations)" checked={isDefault} onChange={setIsDefault} />
          )}
          <Checkbox label="Auto-send after guest checkout" checked={!!config.auto_send_post_stay} onChange={v => setConfig({ ...config, auto_send_post_stay: v })} />
          {config.auto_send_post_stay && (
            <Field label="Send delay (days after checkout)">
              <select
                value={config.auto_send_delay_days ?? 1}
                onChange={e => setConfig({ ...config, auto_send_delay_days: Number(e.target.value) })}
                className={inputCls}
              >
                {[1, 2, 3, 5, 7, 14].map(n => <option key={n} value={n}>{n} day{n === 1 ? '' : 's'}</option>)}
              </select>
            </Field>
          )}

          {form.type === 'basic' && (
            <>
              <Checkbox label="Ask for a comment" checked={!!config.ask_for_comment} onChange={v => setConfig({ ...config, ask_for_comment: v })} />
              <Field label="Redirect threshold (stars)">
                <select value={config.redirect_threshold ?? 4} onChange={e => setConfig({ ...config, redirect_threshold: Number(e.target.value) })} className={inputCls}>
                  <option value={0}>Never redirect</option>
                  {[3, 4, 5].map(n => <option key={n} value={n}>{n}★ and above</option>)}
                </select>
              </Field>
              <Field label="Redirect prompt">
                <input value={config.redirect_prompt ?? ''} onChange={e => setConfig({ ...config, redirect_prompt: e.target.value })} className={inputCls} />
              </Field>
            </>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => saveFormMut.mutate()}
            disabled={saveFormMut.isPending}
            className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-primary-600 transition-colors disabled:opacity-50"
          >
            <Save size={14} /> {saveFormMut.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>

      {/* Questions (custom only) */}
      {form.type === 'custom' && (
        <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Questions</h2>
            <button
              onClick={() => setQuestions(qs => [...qs, { kind: 'stars', label: 'New question', required: false, weight: 1 }])}
              className="border border-dark-border text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-dark-surface2"
            >
              <Plus size={12} /> Add question
            </button>
          </div>

          <div className="space-y-3">
            {questions.length === 0 && (
              <div className="text-center text-[#666] text-sm py-8">No questions yet. Add one to get started.</div>
            )}
            {questions.map((q, i) => (
              <QuestionEditor
                key={i}
                q={q}
                onChange={updated => setQuestions(qs => qs.map((x, ix) => ix === i ? updated : x))}
                onDelete={() => setQuestions(qs => qs.filter((_, ix) => ix !== i))}
                onMove={(dir) => {
                  const to = dir === 'up' ? i - 1 : i + 1
                  if (to < 0 || to >= questions.length) return
                  setQuestions(qs => {
                    const copy = [...qs]
                    ;[copy[i], copy[to]] = [copy[to], copy[i]]
                    return copy
                  })
                }}
              />
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => saveQuestionsMut.mutate()}
              disabled={saveQuestionsMut.isPending}
              className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-primary-600 transition-colors disabled:opacity-50"
            >
              <Save size={14} /> {saveQuestionsMut.isPending ? 'Saving…' : 'Save questions'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls = 'w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider mb-2">{label}</label>
      {children}
    </div>
  )
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-white cursor-pointer self-end">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4" />
      {label}
    </label>
  )
}

function QuestionEditor({ q, onChange, onDelete, onMove }: { q: Question; onChange: (q: Question) => void; onDelete: () => void; onMove: (dir: 'up' | 'down') => void }) {
  const hasChoices = q.kind === 'single_choice' || q.kind === 'multi_choice'
  const choices = q.options?.choices ?? []

  return (
    <div className="bg-[#151515] border border-dark-border rounded-lg p-3 flex gap-3">
      <div className="flex flex-col items-center gap-1 pt-2 text-[#666]">
        <GripVertical size={14} />
        <button onClick={() => onMove('up')} className="hover:text-white text-xs">▲</button>
        <button onClick={() => onMove('down')} className="hover:text-white text-xs">▼</button>
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="md:col-span-2">
          <input
            value={q.label}
            onChange={e => onChange({ ...q, label: e.target.value })}
            placeholder="Question label"
            className={inputCls}
          />
          {q.help_text !== undefined && (
            <input
              value={q.help_text ?? ''}
              onChange={e => onChange({ ...q, help_text: e.target.value })}
              placeholder="Optional help text"
              className={inputCls + ' mt-2'}
            />
          )}
          {hasChoices && (
            <div className="mt-2 space-y-1">
              {choices.map((c, ci) => (
                <div key={ci} className="flex gap-2">
                  <input
                    value={c}
                    onChange={e => {
                      const next = [...choices]; next[ci] = e.target.value
                      onChange({ ...q, options: { ...(q.options ?? {}), choices: next } })
                    }}
                    className={inputCls}
                  />
                  <button
                    onClick={() => onChange({ ...q, options: { ...(q.options ?? {}), choices: choices.filter((_, x) => x !== ci) } })}
                    className="text-red-300 border border-red-500/30 px-2 rounded-lg hover:bg-red-500/10"
                  ><Trash2 size={12} /></button>
                </div>
              ))}
              <button
                onClick={() => onChange({ ...q, options: { ...(q.options ?? {}), choices: [...choices, `Choice ${choices.length + 1}`] } })}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                + Add choice
              </button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <select
            value={q.kind}
            onChange={e => onChange({ ...q, kind: e.target.value as Kind, options: e.target.value === 'single_choice' || e.target.value === 'multi_choice' ? { choices: ['Option 1', 'Option 2'] } : undefined })}
            className={inputCls}
          >
            {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
            <input type="checkbox" checked={q.required} onChange={e => onChange({ ...q, required: e.target.checked })} />
            Required
          </label>
        </div>
      </div>
      <button onClick={onDelete} className="self-start text-red-300 border border-red-500/30 p-1.5 rounded-lg hover:bg-red-500/10">
        <Trash2 size={14} />
      </button>
    </div>
  )
}
