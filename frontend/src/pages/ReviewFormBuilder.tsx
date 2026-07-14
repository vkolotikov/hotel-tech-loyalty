import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Save, Plus, Trash2, GripVertical, Copy, RefreshCw,
  ChevronDown, ChevronRight, Star, Hash, MessageSquare, AlignLeft,
  List, CheckSquare, ToggleLeft, Smile, GitBranch, Eye, EyeOff,
  Settings2, Link2, Zap,
} from 'lucide-react'
import { api, API_URL } from '../lib/api'
import { SurveyDesignPanel, SurveyAnalyticsPanel } from '../components/SurveyDesignPanel'

type Kind = 'text' | 'textarea' | 'stars' | 'scale' | 'nps' | 'single_choice' | 'multi_choice' | 'boolean' | 'emoji'
type CondOp = 'eq' | 'neq' | 'gte' | 'lte' | 'contains' | 'any_of'

interface Question {
  id?: number
  kind: Kind
  label: string
  help_text?: string
  options?: { choices?: string[]; emojis?: string[]; min?: number; max?: number }
  required: boolean
  weight: number
  condition_index?: number | null
  condition_operator?: CondOp | null
  condition_value?: any
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

const KIND_META: Record<Kind, { label: string; icon: typeof Star; color: string; desc: string }> = {
  stars:         { label: 'Star Rating',   icon: Star,         color: '#f59e0b', desc: 'Classic 1–5 stars' },
  emoji:         { label: 'Smileys',       icon: Smile,        color: '#eab308', desc: 'Tap a face — fastest on kiosks' },
  nps:           { label: 'NPS (0–10)',    icon: Zap,          color: '#06b6d4', desc: '"Would you recommend us?"' },
  scale:         { label: 'Scale (1–10)',  icon: Hash,         color: '#8b5cf6', desc: 'Numeric satisfaction scale' },
  single_choice: { label: 'Single Choice', icon: List,         color: '#f97316', desc: 'Pick one option' },
  multi_choice:  { label: 'Multiple Choice', icon: CheckSquare, color: '#ec4899', desc: 'Pick any that apply' },
  boolean:       { label: 'Yes / No',      icon: ToggleLeft,   color: '#14b8a6', desc: 'One quick decision' },
  text:          { label: 'Short Text',    icon: MessageSquare,color: '#10b981', desc: 'One-line answer' },
  textarea:      { label: 'Long Text',     icon: AlignLeft,    color: '#3b82f6', desc: 'Open feedback box' },
}

const COND_OP_LABELS: Record<CondOp, string> = {
  eq: 'is exactly',
  neq: 'is not',
  gte: 'is at least',
  lte: 'is at most',
  contains: 'includes',
  any_of: 'is one of',
}

/** Operators that make sense per PARENT question kind — no more asking
 *  "does this star rating contain…". */
const OPS_BY_PARENT_KIND: Record<Kind, CondOp[]> = {
  stars:         ['lte', 'gte', 'eq', 'neq'],
  scale:         ['lte', 'gte', 'eq', 'neq'],
  nps:           ['lte', 'gte', 'eq', 'neq'],
  emoji:         ['eq', 'neq', 'any_of'],
  single_choice: ['eq', 'neq', 'any_of'],
  multi_choice:  ['contains', 'any_of'],
  boolean:       ['eq'],
  text:          ['contains', 'eq', 'neq'],
  textarea:      ['contains', 'eq', 'neq'],
}

/** Kinds whose answers can meaningfully branch a follow-up. */
const BRANCHABLE_KINDS: Kind[] = ['stars', 'scale', 'nps', 'emoji', 'single_choice', 'boolean']

/** One-click follow-up presets — "if the answer was bad, ask why". */
function followupPreset(parent: Question, parentIndex: number): Question {
  const base: Question = {
    kind: 'textarea', label: 'What could we improve?', required: false, weight: 1,
    condition_index: parentIndex, condition_operator: 'lte', condition_value: '2',
  }
  switch (parent.kind) {
    case 'stars':  return base // ≤ 2 stars
    case 'scale':  return { ...base, condition_value: '4' }
    case 'nps':    return { ...base, condition_value: '6', label: 'What would it take to score us higher?' }
    case 'emoji': {
      const first = parent.options?.choices?.[0] ?? parent.options?.emojis?.[0] ?? ''
      return { ...base, condition_operator: 'eq', condition_value: first }
    }
    case 'single_choice': {
      const first = parent.options?.choices?.[0] ?? ''
      return { ...base, condition_operator: 'eq', condition_value: first, label: `Tell us more about "${first}"` }
    }
    case 'boolean': return { ...base, condition_operator: 'eq', condition_value: 'false', label: 'What went wrong?' }
    default:        return base
  }
}

const DEFAULT_EMOJIS = ['😡', '😕', '😐', '🙂', '😍']

const EMOJI_PRESETS: { name: string; emojis: string[]; labels: string[] }[] = [
  { name: '5 smileys', emojis: ['😡', '😕', '😐', '🙂', '😍'], labels: ['Awful', 'Poor', 'OK', 'Good', 'Great'] },
  { name: '3 smileys', emojis: ['😞', '😐', '😊'],             labels: ['Bad', 'OK', 'Great'] },
  { name: 'Thumbs',    emojis: ['👎', '👍'],                   labels: ['No', 'Yes'] },
  { name: 'Hearts',    emojis: ['💔', '❤️', '😍'],             labels: ['Not for me', 'Liked it', 'Loved it'] },
]

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
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [showSettings, setShowSettings] = useState(false)
  const [view, setView] = useState<'build' | 'design' | 'analytics'>('build')
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const addBtnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (data?.form) {
      setName(data.form.name)
      setIsActive(data.form.is_active)
      setIsDefault(data.form.is_default)
      setConfig(data.form.config ?? {})
      setQuestions(data.form.questions ?? [])
      // Expand all by default on first load
      const expandMap: Record<number, boolean> = {}
      ;(data.form.questions ?? []).forEach((_, i) => { expandMap[i] = true })
      setExpanded(expandMap)
    }
  }, [data])

  const form = data?.form
  // API_URL is '' in production builds (same-origin SPA) — snippets and
  // share links must carry a real origin or they break when pasted into
  // the customer's own website.
  const ORIGIN = API_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  const publicUrl = form ? `${ORIGIN}/review/${form.id}?key=${form.embed_key}` : ''

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
        condition_index: q.condition_index ?? null,
        condition_operator: q.condition_operator ?? null,
        condition_value: q.condition_value ?? null,
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

  const addQuestion = (kind: Kind) => {
    let options: Question['options'] = undefined
    if (kind === 'single_choice' || kind === 'multi_choice') options = { choices: ['Option 1', 'Option 2'] }
    if (kind === 'emoji') options = { emojis: [...DEFAULT_EMOJIS], choices: ['Awful', 'Poor', 'OK', 'Good', 'Great'] }
    const newIdx = questions.length
    setQuestions(qs => [...qs, { kind, label: '', required: false, weight: 1, options }])
    setExpanded(ex => ({ ...ex, [newIdx]: true }))
    setShowAddMenu(false)
  }

  /** Insert a pre-wired follow-up right after its parent, shifting the
   *  condition_index of everything that pointed past the insert point. */
  const addFollowup = (parentIndex: number) => {
    const follow = followupPreset(questions[parentIndex], parentIndex)
    setQuestions(qs => {
      const next = qs.map(q => {
        if (q.condition_index === null || q.condition_index === undefined) return q
        return q.condition_index > parentIndex ? { ...q, condition_index: q.condition_index + 1 } : q
      })
      next.splice(parentIndex + 1, 0, follow)
      return next
    })
    setExpanded(ex => {
      const next: Record<number, boolean> = {}
      Object.entries(ex).forEach(([k, v]) => {
        const ki = Number(k)
        next[ki > parentIndex ? ki + 1 : ki] = v
      })
      next[parentIndex + 1] = true
      return next
    })
  }

  /** Delete + heal every condition reference. Children pointing AT the
   *  deleted question lose their condition (they'd otherwise silently
   *  retarget the question that slides into the same slot); references
   *  past it shift down by one. */
  const removeQuestion = (i: number) => {
    setQuestions(qs => qs
      .filter((_, ix) => ix !== i)
      .map(q => {
        if (q.condition_index === null || q.condition_index === undefined) return q
        if (q.condition_index === i) return { ...q, condition_index: null, condition_operator: null, condition_value: null }
        if (q.condition_index > i) return { ...q, condition_index: q.condition_index - 1 }
        return q
      }))
    setExpanded(ex => {
      const next: Record<number, boolean> = {}
      Object.entries(ex).forEach(([k, v]) => {
        const ki = Number(k)
        if (ki < i) next[ki] = v
        else if (ki > i) next[ki - 1] = v
      })
      return next
    })
  }

  const moveQuestion = (from: number, to: number) => {
    if (to < 0 || to >= questions.length) return
    setQuestions(qs => {
      const copy = [...qs]
      const [moved] = copy.splice(from, 1)
      copy.splice(to, 0, moved)
      // Fix condition indices that reference moved questions
      return copy.map(q => {
        if (q.condition_index === null || q.condition_index === undefined) return q
        let ci = q.condition_index
        if (ci === from) ci = to
        else if (from < to && ci > from && ci <= to) ci--
        else if (from > to && ci >= to && ci < from) ci++
        return { ...q, condition_index: ci }
      })
    })
    setExpanded(ex => {
      const copy = { ...ex }
      const fromExp = copy[from]
      if (from < to) {
        for (let i = from; i < to; i++) copy[i] = copy[i + 1]
      } else {
        for (let i = from; i > to; i--) copy[i] = copy[i - 1]
      }
      copy[to] = fromExp
      return copy
    })
  }

  // Close add menu on outside click
  useEffect(() => {
    if (!showAddMenu) return
    const handler = (e: MouseEvent) => {
      if (addBtnRef.current && !addBtnRef.current.contains(e.target as Node)) setShowAddMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAddMenu])

  if (isLoading || !form) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-dark-surface border border-dark-border rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const hasConditions = questions.some(q => q.condition_index !== null && q.condition_index !== undefined)

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto pb-32">
      {/* Header */}
      <button
        onClick={() => navigate('/reviews')}
        className="flex items-center gap-2 text-[#a0a0a0] hover:text-white text-sm mb-5 transition-colors"
      >
        <ArrowLeft size={16} /> Back to reviews
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-transparent text-2xl font-bold text-white focus:outline-none w-full placeholder:text-[#444]"
            placeholder="Form name"
          />
          <div className="flex items-center gap-2 mt-2">
            <span className="px-2 py-0.5 rounded-md bg-[#1e1e1e] text-[#a0a0a0] text-[10px] uppercase tracking-wider font-semibold">
              {form.type}
            </span>
            {form.is_default && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[10px] uppercase tracking-wider font-semibold">
                Default
              </span>
            )}
            <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-semibold ${isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
            {hasConditions && (
              <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                <GitBranch size={10} /> Conditional logic
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2.5 rounded-xl border transition-colors ${showSettings ? 'bg-primary-500/15 border-primary-500/40 text-primary-400' : 'border-dark-border text-[#a0a0a0] hover:text-white hover:bg-dark-surface2'}`}
            title="Form settings"
          >
            <Settings2 size={18} />
          </button>
        </div>
      </div>

      {/* Public URL bar */}
      <div className="flex items-center gap-2 mb-6 bg-dark-surface border border-dark-border rounded-xl px-4 py-3">
        <Link2 size={14} className="text-[#666] shrink-0" />
        <input
          readOnly
          value={publicUrl}
          className="flex-1 bg-transparent text-xs text-[#a0a0a0] font-mono focus:outline-none min-w-0"
        />
        <button
          onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Copied') }}
          className="text-[#a0a0a0] hover:text-white p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
          title="Copy URL"
        >
          <Copy size={14} />
        </button>
        <button
          onClick={() => confirm('Rotating invalidates every existing shared link. Continue?') && rotateKeyMut.mutate()}
          className="text-[#a0a0a0] hover:text-white p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
          title="Rotate embed key"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Build / Design / Analytics switcher */}
      <div className="flex gap-1 bg-[#1e1e1e] p-1 rounded-lg text-sm w-fit mb-6">
        {(['build', 'design', 'analytics'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-md font-semibold capitalize transition-colors ${view === v ? 'bg-primary-500 text-white' : 'text-[#a0a0a0] hover:text-white'}`}>
            {v === 'build' ? 'Questions' : v}
          </button>
        ))}
      </div>

      {view === 'design' && (
        <SurveyDesignPanel
          config={config}
          setConfig={setConfig}
          onSave={() => saveFormMut.mutate()}
          saving={saveFormMut.isPending}
          previewUrl={publicUrl + '&preview=1'}
          embed={{ formId: form.id, embedKey: form.embed_key, origin: ORIGIN }}
        />
      )}
      {view === 'analytics' && <SurveyAnalyticsPanel formId={form.id} />}

      {/* Build view — display-gated (not unmounted) so in-progress edits
          survive a tab switch; the fixed save bar hides with it. */}
      <div style={view === 'build' ? undefined : { display: 'none' }}>
      {/* Basic surveys have a fixed structure (star rating + optional
          comment) — their settings ARE the build surface, so they render
          unconditionally with an explainer instead of a blank page. */}
      {form.type === 'basic' && (
        <div className="bg-primary-500/[0.06] border border-primary-500/25 rounded-xl p-4 mb-6 text-[12.5px] text-[#c8c8cc] leading-relaxed">
          This is a <span className="font-semibold text-white">basic survey</span>: a 5-star rating question
          {config.ask_for_comment ? ' plus an optional comment box' : ''}, with high ratings offered a redirect
          to your public review profiles. Adjust its behaviour below — or create a <span className="font-semibold text-white">custom survey</span> from
          the Forms tab to compose your own questions (NPS, smileys, choices, follow-ups…).
        </div>
      )}
      {/* Collapsible Settings Panel */}
      {(showSettings || form.type === 'basic') && (
        <div className="bg-dark-surface border border-dark-border rounded-xl mb-6 overflow-hidden">
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Intro text">
                <textarea
                  value={config.intro_text ?? ''}
                  onChange={e => setConfig({ ...config, intro_text: e.target.value })}
                  rows={2}
                  className={inputCls}
                  placeholder="Welcome text shown at the top of the form"
                />
              </Field>
              <Field label="Thank you text">
                <textarea
                  value={config.thank_you_text ?? ''}
                  onChange={e => setConfig({ ...config, thank_you_text: e.target.value })}
                  rows={2}
                  className={inputCls}
                  placeholder="Message shown after submission"
                />
              </Field>

              <div className="space-y-3">
                <Toggle label="Allow anonymous submissions" checked={!!config.allow_anonymous} onChange={v => setConfig({ ...config, allow_anonymous: v })} />
                <Toggle label="Form is active" checked={isActive} onChange={setIsActive} />
                {!form.is_default && (
                  <Toggle label="Set as default form" checked={isDefault} onChange={setIsDefault} />
                )}
                <Toggle label="Auto-send after checkout" checked={!!config.auto_send_post_stay} onChange={v => setConfig({ ...config, auto_send_post_stay: v })} />
              </div>

              <div className="space-y-3">
                {config.auto_send_post_stay && (
                  <Field label="Send delay (days)">
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
                    <Toggle label="Ask for a comment" checked={!!config.ask_for_comment} onChange={v => setConfig({ ...config, ask_for_comment: v })} />
                    <Field label="Redirect threshold">
                      <select
                        value={config.redirect_threshold ?? 4}
                        onChange={e => setConfig({ ...config, redirect_threshold: Number(e.target.value) })}
                        className={inputCls}
                      >
                        <option value={0}>Never redirect</option>
                        {[3, 4, 5].map(n => <option key={n} value={n}>{n}★ and above</option>)}
                      </select>
                    </Field>
                    <Field label="Redirect prompt">
                      <input
                        value={config.redirect_prompt ?? ''}
                        onChange={e => setConfig({ ...config, redirect_prompt: e.target.value })}
                        className={inputCls}
                        placeholder="Would you share this on a review site?"
                      />
                    </Field>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="border-t border-dark-border bg-[#0f0f0f] px-5 py-3 flex justify-end">
            <button
              onClick={() => saveFormMut.mutate()}
              disabled={saveFormMut.isPending}
              className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-primary-600 transition-colors disabled:opacity-50"
            >
              <Save size={14} /> {saveFormMut.isPending ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </div>
      )}

      {/* Questions Builder */}
      {form.type === 'custom' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Questions</h2>
              <span className="text-[10px] bg-white/[0.06] text-[#888] px-2 py-0.5 rounded-full font-medium">
                {questions.length} {questions.length === 1 ? 'question' : 'questions'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const allExpanded = questions.every((_, i) => expanded[i])
                  const next: Record<number, boolean> = {}
                  questions.forEach((_, i) => { next[i] = !allExpanded })
                  setExpanded(next)
                }}
                className="text-[#a0a0a0] hover:text-white text-xs px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors flex items-center gap-1.5"
              >
                {questions.every((_, i) => expanded[i]) ? <EyeOff size={12} /> : <Eye size={12} />}
                {questions.every((_, i) => expanded[i]) ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {questions.length === 0 && (
              <div className="border-2 border-dashed border-dark-border rounded-xl py-16 text-center">
                <div className="text-[#444] text-4xl mb-3">+</div>
                <div className="text-[#888] text-sm font-medium mb-1">No questions yet</div>
                <div className="text-[#555] text-xs">Add your first question to start building the review form</div>
              </div>
            )}

            {questions.map((q, i) => {
              const meta = KIND_META[q.kind]
              const Icon = meta.icon
              const isExpanded = expanded[i] ?? false
              const hasCondition = q.condition_index !== null && q.condition_index !== undefined
              const isDragging = dragIdx === i
              const isDragOver = dragOverIdx === i && dragIdx !== i

              return (
                <div
                  key={i}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragEnd={() => {
                    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
                      moveQuestion(dragIdx, dragOverIdx)
                    }
                    setDragIdx(null)
                    setDragOverIdx(null)
                  }}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(i) }}
                  className={`group rounded-xl border transition-all ${
                    isDragging ? 'opacity-40 scale-[0.98]' : ''
                  } ${isDragOver ? 'border-primary-500/50 bg-primary-500/[0.03]' : 'border-dark-border bg-dark-surface hover:border-white/[0.08]'}`}
                >
                  {/* Condition connector line */}
                  {hasCondition && (
                    <div className="flex items-center gap-2 px-4 pt-3 pb-0">
                      <span className="w-4 border-l-2 border-b-2 border-purple-500/40 rounded-bl-lg h-3 -mb-1" />
                      <div className="flex items-center gap-1.5 text-[10px] font-medium text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-full px-2.5 py-1 min-w-0">
                        <GitBranch size={10} className="shrink-0" />
                        <span className="truncate">
                          Only if "{(questions[q.condition_index ?? 0]?.label || `Q${(q.condition_index ?? 0) + 1}`).slice(0, 28)}"{' '}
                          {COND_OP_LABELS[q.condition_operator ?? 'eq']}{' '}
                          <span className="text-purple-300 font-semibold">
                            {Array.isArray(q.condition_value) ? q.condition_value.join(', ') : String(q.condition_value ?? '')}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Question header — always visible */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                    onClick={() => setExpanded(ex => ({ ...ex, [i]: !ex[i] }))}
                  >
                    <div className="text-[#444] cursor-grab active:cursor-grabbing shrink-0" onClick={e => e.stopPropagation()}>
                      <GripVertical size={16} />
                    </div>

                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: meta.color + '18' }}
                    >
                      <Icon size={16} style={{ color: meta.color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#555] tabular-nums">Q{i + 1}</span>
                        <span className="text-sm text-white font-medium truncate">
                          {q.label || <span className="text-[#555] italic">Untitled question</span>}
                        </span>
                      </div>
                      {!isExpanded && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[#666]">{meta.label}</span>
                          {q.required && <span className="text-[10px] text-amber-400/70 font-medium">Required</span>}
                          {(() => {
                            const kids = questions.filter(x => x.condition_index === i).length
                            return kids > 0
                              ? <span className="text-[10px] text-purple-400/80 font-medium flex items-center gap-0.5"><GitBranch size={9} /> {kids} follow-up{kids > 1 ? 's' : ''}</span>
                              : null
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isExpanded ? <ChevronDown size={16} className="text-[#555]" /> : <ChevronRight size={16} className="text-[#555]" />}
                    </div>
                  </div>

                  {/* Expanded question editor */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-dark-border mx-4 mt-0">
                      <div className="pt-4 space-y-4">
                        {/* Label + Type row */}
                        <div className="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-3">
                          <div>
                            <label className="block text-[10px] font-semibold text-[#888] uppercase tracking-wider mb-1.5">Question</label>
                            <input
                              value={q.label}
                              onChange={e => setQuestions(qs => qs.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))}
                              placeholder="Enter your question..."
                              className={inputCls}
                              autoFocus={!q.label}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-[#888] uppercase tracking-wider mb-1.5">Type</label>
                            <select
                              value={q.kind}
                              onChange={e => {
                                const k = e.target.value as Kind
                                let options: Question['options'] = undefined
                                if (k === 'single_choice' || k === 'multi_choice') options = { choices: ['Option 1', 'Option 2'] }
                                if (k === 'emoji') options = { emojis: [...DEFAULT_EMOJIS], choices: ['Awful', 'Poor', 'OK', 'Good', 'Great'] }
                                setQuestions(qs => qs.map((x, ix) => ix === i ? { ...x, kind: k, options } : x))
                              }}
                              className={inputCls}
                            >
                              {Object.entries(KIND_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Help text */}
                        <div>
                          <label className="block text-[10px] font-semibold text-[#888] uppercase tracking-wider mb-1.5">
                            Help text <span className="font-normal text-[#555]">(optional)</span>
                          </label>
                          <input
                            value={q.help_text ?? ''}
                            onChange={e => setQuestions(qs => qs.map((x, ix) => ix === i ? { ...x, help_text: e.target.value || undefined } : x))}
                            placeholder="Additional context shown below the question"
                            className={inputCls}
                          />
                        </div>

                        {/* Choice options */}
                        {(q.kind === 'single_choice' || q.kind === 'multi_choice') && (
                          <ChoiceEditor
                            choices={q.options?.choices ?? []}
                            onChange={choices => setQuestions(qs => qs.map((x, ix) => ix === i ? { ...x, options: { ...x.options, choices } } : x))}
                          />
                        )}

                        {/* Emoji options */}
                        {q.kind === 'emoji' && (
                          <EmojiEditor
                            emojis={q.options?.emojis ?? []}
                            labels={q.options?.choices ?? []}
                            onChange={(emojis, choices) => setQuestions(qs => qs.map((x, ix) => ix === i ? { ...x, options: { ...x.options, emojis, choices } } : x))}
                          />
                        )}

                        {/* Scale / NPS end labels */}
                        {(q.kind === 'nps' || q.kind === 'scale') && (
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Left label (low end)">
                              <input
                                value={(q.options as any)?.left_label ?? ''}
                                onChange={e => setQuestions(qs => qs.map((x, ix) => ix === i ? { ...x, options: { ...x.options, left_label: e.target.value || undefined } as any } : x))}
                                placeholder={q.kind === 'nps' ? 'Not likely at all' : 'Poor'}
                                className={inputCls}
                              />
                            </Field>
                            <Field label="Right label (high end)">
                              <input
                                value={(q.options as any)?.right_label ?? ''}
                                onChange={e => setQuestions(qs => qs.map((x, ix) => ix === i ? { ...x, options: { ...x.options, right_label: e.target.value || undefined } as any } : x))}
                                placeholder={q.kind === 'nps' ? 'Extremely likely' : 'Excellent'}
                                className={inputCls}
                              />
                            </Field>
                          </div>
                        )}

                        {/* Preview */}
                        <QuestionPreview q={q} />

                        {/* Conditional logic */}
                        {i > 0 && (
                          <ConditionEditor
                            q={q}
                            index={i}
                            priorQuestions={questions.slice(0, i)}
                            onChange={updated => setQuestions(qs => qs.map((x, ix) => ix === i ? updated : x))}
                          />
                        )}

                        {/* Footer: required toggle + delete */}
                        <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                          <div className="flex items-center gap-4">
                            <Toggle
                              label="Required"
                              checked={q.required}
                              onChange={v => setQuestions(qs => qs.map((x, ix) => ix === i ? { ...x, required: v } : x))}
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            {BRANCHABLE_KINDS.includes(q.kind) && (
                              <button
                                onClick={() => addFollowup(i)}
                                title="Insert a question that only shows for certain answers to this one"
                                className="text-purple-300/80 hover:text-purple-300 hover:bg-purple-500/10 border border-purple-500/25 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium"
                              >
                                <GitBranch size={12} /> Add follow-up
                              </button>
                            )}
                            <button
                              onClick={() => removeQuestion(i)}
                              className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs"
                            >
                              <Trash2 size={13} /> Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add question button */}
          <div className="mt-4 relative" ref={addBtnRef}>
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-full border-2 border-dashed border-dark-border hover:border-primary-500/30 rounded-xl py-3 text-sm font-medium text-[#888] hover:text-primary-400 flex items-center justify-center gap-2 transition-colors"
            >
              <Plus size={16} /> Add question
            </button>

            {showAddMenu && (
              <div className="absolute left-0 right-0 bottom-full mb-2 bg-[#161616] border border-dark-border rounded-2xl shadow-2xl shadow-black/50 p-3 grid grid-cols-2 md:grid-cols-3 gap-2 z-50 max-h-[60vh] overflow-y-auto">
                {(Object.entries(KIND_META) as [Kind, typeof KIND_META[Kind]][]).map(([kind, meta]) => {
                  const Icon = meta.icon
                  return (
                    <button
                      key={kind}
                      onClick={() => addQuestion(kind)}
                      className="rounded-xl border border-dark-border bg-[#1c1c1c] hover:border-primary-500/40 hover:bg-white/[0.03] transition-all text-left p-3 group/item"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: meta.color + '18' }}>
                          <Icon size={14} style={{ color: meta.color }} />
                        </div>
                        <span className="text-xs text-white font-semibold">{meta.label}</span>
                      </div>
                      <div className="text-[10px] text-[#777] mb-2 leading-snug">{meta.desc}</div>
                      <KindExample kind={kind} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Save questions bar */}
          {questions.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-[#111]/95 backdrop-blur-sm border-t border-dark-border px-6 py-4 flex items-center justify-between z-40">
              <div className="text-xs text-[#888]">
                {questions.length} question{questions.length !== 1 ? 's' : ''}
                {hasConditions && <span className="ml-2 text-purple-400">with conditional logic</span>}
              </div>
              <button
                onClick={() => saveQuestionsMut.mutate()}
                disabled={saveQuestionsMut.isPending}
                className="bg-primary-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                <Save size={14} /> {saveQuestionsMut.isPending ? 'Saving...' : 'Save questions'}
              </button>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  )
}

/* ──────────────────────── Shared helpers ──────────────────────── */

const inputCls = 'w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 placeholder:text-[#444] transition-shadow'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#888] uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-[#ccc] cursor-pointer group/toggle">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full relative transition-colors ${checked ? 'bg-primary-500' : 'bg-[#333]'}`}
      >
        <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all ${checked ? 'left-[19px]' : 'left-[3px]'}`} />
      </button>
      <span className="text-xs">{label}</span>
    </label>
  )
}

/* ──────────────────────── Choice editor ──────────────────────── */

function ChoiceEditor({ choices, onChange }: { choices: string[]; onChange: (c: string[]) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#888] uppercase tracking-wider mb-1.5">Choices</label>
      <div className="space-y-1.5">
        {choices.map((c, ci) => (
          <div key={ci} className="flex gap-2 items-center">
            <div className="w-5 h-5 rounded-full border border-[#444] shrink-0 flex items-center justify-center text-[10px] text-[#555]">
              {ci + 1}
            </div>
            <input
              value={c}
              onChange={e => {
                const next = [...choices]
                next[ci] = e.target.value
                onChange(next)
              }}
              className={inputCls}
              placeholder={`Choice ${ci + 1}`}
            />
            <button
              onClick={() => onChange(choices.filter((_, x) => x !== ci))}
              className="text-[#555] hover:text-red-400 p-1 rounded transition-colors shrink-0"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...choices, `Choice ${choices.length + 1}`])}
          className="text-xs text-primary-400 hover:text-primary-300 font-medium flex items-center gap-1 mt-1"
        >
          <Plus size={12} /> Add choice
        </button>
      </div>
    </div>
  )
}

/* ──────────────────────── Emoji editor ──────────────────────── */

function EmojiEditor({ emojis, labels, onChange }: {
  emojis: string[]; labels: string[]; onChange: (e: string[], l: string[]) => void
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#888] uppercase tracking-wider mb-1.5">Emoji reactions</label>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {EMOJI_PRESETS.map(p => (
          <button key={p.name} onClick={() => onChange([...p.emojis], [...p.labels])}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1e1e1e] border border-dark-border text-[11px] font-medium text-[#bbb] hover:text-white hover:border-primary-500/40 transition-colors">
            <span className="leading-none">{p.emojis.join('')}</span> {p.name}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        {emojis.map((emoji, ci) => (
          <div key={ci} className="flex gap-2 items-center">
            <input
              value={emoji}
              onChange={e => {
                const next = [...emojis]; next[ci] = e.target.value
                onChange(next, labels)
              }}
              className={inputCls + ' !w-14 text-center text-lg'}
              placeholder="😀"
            />
            <input
              value={labels[ci] ?? ''}
              onChange={e => {
                const next = [...labels]; next[ci] = e.target.value
                onChange(emojis, next)
              }}
              className={inputCls}
              placeholder="Label (e.g. Great)"
            />
            <button
              onClick={() => onChange(emojis.filter((_, x) => x !== ci), labels.filter((_, x) => x !== ci))}
              className="text-[#555] hover:text-red-400 p-1 rounded transition-colors shrink-0"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...emojis, '🙂'], [...labels, `Option ${emojis.length + 1}`])}
          className="text-xs text-primary-400 hover:text-primary-300 font-medium flex items-center gap-1 mt-1"
        >
          <Plus size={12} /> Add emoji
        </button>
      </div>
    </div>
  )
}

/* ──────────────────────── Condition editor ──────────────────────── */

function ConditionEditor({ q, index, priorQuestions, onChange }: {
  q: Question; index: number; priorQuestions: Question[]; onChange: (q: Question) => void
}) {
  const hasCondition = q.condition_index !== null && q.condition_index !== undefined
  const parent = hasCondition ? priorQuestions[q.condition_index ?? 0] : null
  const ops: CondOp[] = parent ? (OPS_BY_PARENT_KIND[parent.kind] ?? ['eq', 'neq']) : ['eq']

  const setParent = (pi: number) => {
    const p = priorQuestions[pi]
    const firstOp = (OPS_BY_PARENT_KIND[p.kind] ?? ['eq'])[0]
    // Sensible default value per parent kind so the rule is valid the
    // moment it's created.
    let value: any = ''
    if (p.kind === 'stars') value = '2'
    else if (p.kind === 'scale') value = '4'
    else if (p.kind === 'nps') value = '6'
    else if (p.kind === 'boolean') value = 'true'
    else if (p.kind === 'emoji' || p.kind === 'single_choice' || p.kind === 'multi_choice') {
      value = p.options?.choices?.[0] ?? p.options?.emojis?.[0] ?? ''
    }
    onChange({ ...q, condition_index: pi, condition_operator: firstOp, condition_value: value })
  }

  return (
    <div className={`rounded-xl border transition-colors ${hasCondition ? 'border-purple-500/25 bg-purple-500/[0.04]' : 'border-dashed border-dark-border'} p-3.5`}>
      <div className="flex items-center gap-2 mb-0">
        <GitBranch size={13} className={hasCondition ? 'text-purple-400' : 'text-[#666]'} />
        <span className="text-xs font-semibold text-[#ccc]">Show this question</span>
        <div className="flex gap-0.5 bg-[#141414] border border-dark-border p-0.5 rounded-lg ml-1">
          <button
            onClick={() => onChange({ ...q, condition_index: null, condition_operator: null, condition_value: null })}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${!hasCondition ? 'bg-white/[0.09] text-white' : 'text-[#888] hover:text-white'}`}
          >Always</button>
          <button
            onClick={() => { if (!hasCondition) setParent(index - 1) }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${hasCondition ? 'bg-purple-500/25 text-purple-200' : 'text-[#888] hover:text-white'}`}
          >Only if…</button>
        </div>
      </div>

      {hasCondition && parent && (
        <div className="mt-3 space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <select
              value={q.condition_index ?? 0}
              onChange={e => setParent(Number(e.target.value))}
              className={inputCls}
            >
              {priorQuestions.map((pq, pi) => (
                <option key={pi} value={pi}>Q{pi + 1} · {KIND_META[pq.kind].label}: {pq.label.slice(0, 32) || 'Untitled'}</option>
              ))}
            </select>
            <select
              value={q.condition_operator ?? ops[0]}
              onChange={e => {
                const op = e.target.value as CondOp
                // any_of stores an array; scalar ops store a string.
                let value = q.condition_value
                if (op === 'any_of' && !Array.isArray(value)) value = value ? [value] : []
                if (op !== 'any_of' && Array.isArray(value)) value = value[0] ?? ''
                onChange({ ...q, condition_operator: op, condition_value: value })
              }}
              className={inputCls}
            >
              {ops.map(op => <option key={op} value={op}>answer {COND_OP_LABELS[op]}</option>)}
            </select>
          </div>

          <ConditionValuePicker parent={parent} q={q} onChange={onChange} />

          <p className="text-[10px] text-[#666] leading-relaxed">
            The guest only sees this question when the rule matches — otherwise the survey skips straight past it.
          </p>
        </div>
      )}
    </div>
  )
}

/** Value input rendered as the PARENT's answer widget — tap the stars /
 *  pills / chips the guest would tap, instead of typing raw values. */
function ConditionValuePicker({ parent, q, onChange }: { parent: Question; q: Question; onChange: (q: Question) => void }) {
  const isMulti = q.condition_operator === 'any_of'
  const asArray: string[] = isMulti
    ? (Array.isArray(q.condition_value) ? q.condition_value.map(String) : (q.condition_value ? [String(q.condition_value)] : []))
    : []
  const scalar = Array.isArray(q.condition_value) ? String(q.condition_value[0] ?? '') : String(q.condition_value ?? '')

  const pick = (v: string) => {
    if (isMulti) {
      const next = asArray.includes(v) ? asArray.filter(x => x !== v) : [...asArray, v]
      onChange({ ...q, condition_value: next })
    } else {
      onChange({ ...q, condition_value: v })
    }
  }
  const isOn = (v: string) => isMulti ? asArray.includes(v) : scalar === v

  if (parent.kind === 'stars') {
    return (
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => pick(String(n))} title={`${n} star${n > 1 ? 's' : ''}`}
            className="p-0.5">
            <Star size={22} className={Number(scalar) >= n ? 'text-amber-400 fill-amber-400' : 'text-[#3a3a3a]'} />
          </button>
        ))}
        <span className="text-xs text-[#888] ml-2">{scalar || '—'} star{scalar === '1' ? '' : 's'}</span>
      </div>
    )
  }

  if (parent.kind === 'scale' || parent.kind === 'nps') {
    const lo = parent.kind === 'nps' ? 0 : 1
    return (
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 11 - lo }, (_, ix) => lo + ix).map(n => (
          <button key={n} onClick={() => pick(String(n))}
            className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${isOn(String(n)) ? 'bg-purple-500 text-white' : 'bg-[#1e1e1e] border border-dark-border text-[#999] hover:text-white'}`}>
            {n}
          </button>
        ))}
      </div>
    )
  }

  if (parent.kind === 'boolean') {
    return (
      <div className="flex gap-1.5">
        {[['true', 'Yes'], ['false', 'No']].map(([v, lbl]) => (
          <button key={v} onClick={() => pick(v)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${isOn(v) ? 'bg-purple-500 text-white' : 'bg-[#1e1e1e] border border-dark-border text-[#999] hover:text-white'}`}>
            {lbl}
          </button>
        ))}
      </div>
    )
  }

  if (parent.kind === 'emoji' || parent.kind === 'single_choice' || parent.kind === 'multi_choice') {
    const opts = parent.options?.choices?.length
      ? parent.options.choices
      : (parent.options?.emojis ?? [])
    const emojis = parent.options?.emojis ?? []
    return (
      <div className="flex flex-wrap gap-1.5">
        {opts.map((c, ci) => (
          <button key={ci} onClick={() => pick(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${isOn(c) ? 'bg-purple-500 text-white' : 'bg-[#1e1e1e] border border-dark-border text-[#bbb] hover:text-white'}`}>
            {parent.kind === 'emoji' && emojis[ci] && <span className="text-sm leading-none">{emojis[ci]}</span>}
            {c}
          </button>
        ))}
        {isMulti && <span className="text-[10px] text-[#666] self-center ml-1">tap all that apply</span>}
      </div>
    )
  }

  // text / textarea parents — free text match
  return (
    <input
      value={scalar}
      onChange={e => onChange({ ...q, condition_value: e.target.value })}
      placeholder="text to match…"
      className={inputCls}
    />
  )
}

/** Mini visual example per kind — used inside the type-picker gallery. */
function KindExample({ kind }: { kind: Kind }) {
  switch (kind) {
    case 'stars':
      return <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(n => <Star key={n} size={13} className={n <= 4 ? 'text-amber-400 fill-amber-400' : 'text-[#333]'} />)}</div>
    case 'emoji':
      return <div className="flex gap-1 text-[13px] leading-none">😡 😕 😐 🙂 😍</div>
    case 'nps':
      return (
        <div className="flex gap-[2px]">
          {Array.from({ length: 11 }, (_, n) => (
            <span key={n} className={`w-2.5 h-2.5 rounded-[2px] ${n <= 6 ? 'bg-red-400/70' : n <= 8 ? 'bg-amber-400/70' : 'bg-emerald-400/70'}`} />
          ))}
        </div>
      )
    case 'scale':
      return <div className="flex gap-[2px]">{Array.from({ length: 10 }, (_, n) => <span key={n} className={`w-2.5 h-2.5 rounded-[2px] ${n < 6 ? 'bg-violet-400/70' : 'bg-[#333]'}`} />)}</div>
    case 'single_choice':
      return <div className="space-y-[3px]"><div className="h-[7px] w-4/5 rounded bg-orange-400/40" /><div className="h-[7px] w-3/5 rounded bg-[#333]" /></div>
    case 'multi_choice':
      return <div className="space-y-[3px]"><div className="h-[7px] w-4/5 rounded bg-pink-400/40" /><div className="h-[7px] w-2/3 rounded bg-pink-400/40" /></div>
    case 'boolean':
      return <div className="flex gap-1 text-[12px] leading-none">👍 👎</div>
    case 'text':
      return <div className="h-[8px] w-full rounded bg-[#333]" />
    case 'textarea':
      return <div className="space-y-[3px]"><div className="h-[7px] w-full rounded bg-[#333]" /><div className="h-[7px] w-2/3 rounded bg-[#333]" /></div>
  }
}

/* ──────────────────────── Question preview ──────────────────────── */

function QuestionPreview({ q }: { q: Question }) {
  return (
    <div className="rounded-lg bg-[#0f0f0f] border border-white/[0.04] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[#555] font-semibold mb-2 flex items-center gap-1">
        <Eye size={10} /> Preview
      </div>
      <div className="text-sm text-white font-medium mb-1">
        {q.label || 'Your question here'}
        {q.required && <span className="text-red-400 ml-0.5">*</span>}
      </div>
      {q.help_text && <div className="text-xs text-[#888] mb-2">{q.help_text}</div>}

      {q.kind === 'stars' && (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => <Star key={n} size={20} className={n <= 3 ? 'text-amber-400 fill-amber-400' : 'text-[#333]'} />)}
        </div>
      )}
      {q.kind === 'scale' && (
        <div className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={`w-7 h-7 rounded text-xs flex items-center justify-center font-medium ${i < 6 ? 'bg-primary-500/20 text-primary-300' : 'bg-[#1e1e1e] text-[#555]'}`}>
              {i + 1}
            </div>
          ))}
        </div>
      )}
      {q.kind === 'nps' && (
        <div className="flex gap-0.5">
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} className={`w-6 h-7 rounded text-[10px] flex items-center justify-center font-medium ${i <= 6 ? (i <= 3 ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300') : 'bg-emerald-500/20 text-emerald-300'}`}>
              {i}
            </div>
          ))}
        </div>
      )}
      {q.kind === 'text' && (
        <div className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-xs text-[#555]">Short answer...</div>
      )}
      {q.kind === 'textarea' && (
        <div className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-xs text-[#555] h-16">Long answer...</div>
      )}
      {q.kind === 'boolean' && (
        <div className="flex gap-2">
          <div className="px-4 py-1.5 rounded-lg bg-primary-500/15 text-primary-300 text-xs font-medium">Yes</div>
          <div className="px-4 py-1.5 rounded-lg bg-[#1e1e1e] text-[#555] text-xs">No</div>
        </div>
      )}
      {(q.kind === 'single_choice' || q.kind === 'multi_choice') && (
        <div className="space-y-1.5">
          {(q.options?.choices ?? []).slice(0, 4).map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-4 h-4 border border-[#444] shrink-0 ${q.kind === 'multi_choice' ? 'rounded' : 'rounded-full'} ${i === 0 ? 'bg-primary-500/30 border-primary-500/50' : ''}`} />
              <span className="text-xs text-[#aaa]">{c}</span>
            </div>
          ))}
        </div>
      )}
      {q.kind === 'emoji' && (
        <div className="flex gap-3">
          {(q.options?.emojis ?? []).map((e, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span className={`text-2xl ${i === 3 ? 'scale-125' : 'opacity-60'}`}>{e}</span>
              <span className="text-[10px] text-[#666]">{(q.options?.choices ?? [])[i] ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
