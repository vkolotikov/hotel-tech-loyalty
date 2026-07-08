import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Check, ChevronDown, ChevronUp, Loader, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import {
  cp,
  errMsg,
  PLATFORM_META,
  PLATFORMS,
  MIX_CATEGORIES,
  DEFAULT_MIX,
  DEFAULT_RHYTHM,
  WEEKDAYS,
  WEEKDAY_ROLE_META,
  ENGAGEMENT_GOALS,
  TONES,
  TREND_MODES,
  PRICE_POSITIONS,
  FORMALITY_LEVELS,
  SENTENCE_STYLES,
  POINTS_OF_VIEW,
  EMOJI_POLICIES,
  HASHTAG_POLICIES,
  VISUAL_STYLES,
  IMAGE_TYPES,
} from './lib'
import type { PlannerProfile, ProfileResponse, Audience, Channel } from './lib'

/* ─── Local wizard types ─────────────────────────────────────────── */

type Detected = ProfileResponse['detected_knowledge']
type ReadinessData = NonNullable<ProfileResponse['readiness']>

interface WizardAudience {
  name: string
  job_role: string
  industry: string
  country: string
  language: string
  business_size: string
  pain_points: string[]
  goals: string[]
  fears: string[]
  objections: string[]
  buying_triggers: string[]
  emotional_triggers: string[]
  rational_triggers: string[]
  questions: string[]
  content_they_trust: string
  desired_transformation: string
  preferred_platforms: string[]
}

interface WizardChannel {
  active: boolean
  label: string
  url: string
  goal: string
  role: string
  audience_index: number | null
  posts_per_week: number
  frequency: Record<string, boolean>
  preferred_formats: string[]
  emoji_policy: string
  hashtag_policy: string
  cta_style: string
  visual_style: string
  link_policy: string
  tone_override: string
}

interface WizardVoice {
  tone: string
  formality_level: string
  sentence_style: string
  point_of_view: string
  emoji_policy: string
  hashtag_policy: string
  preferred_words: string[]
  forbidden_words: string[]
  claims_to_avoid: string[]
}

interface WizardForm {
  name: string
  primary_goal: string
  primary_goal_custom: boolean
  default_language: string
  knowledge_sources: { use_faq: boolean; use_knowledge_base: boolean; use_company_settings: boolean; use_services: boolean }
  brand_summary: string
  usp: string
  mission: string
  brand_promise: string
  differentiators: string
  brand_values: string[]
  proof_points: string[]
  price_position: string
  main_cta: string
  important_links: string[]
  audiences: WizardAudience[]
  voice: WizardVoice
  positioning: { old_way: string; new_way: string; transformation: string; beliefs: string[] }
  key_messages: string[]
  channels: Record<string, WizardChannel>
  weekly_rhythm: Record<string, { role: string; notes: string }>
  content_mix: Record<string, number>
  mix_ai: boolean
  engagement_goals: string[]
  trend_mode: string
  visual: { style: string; image_types: string[]; avoid: string[]; aspect_ratios: string[]; colors: string[] }
}

type Up = (patch: Partial<WizardForm>) => void
interface StepProps { form: WizardForm; up: Up }

/* ─── Constants & helpers ────────────────────────────────────────── */

const DRAFT_KEY = 'cp-wizard-draft-v2'
const CUSTOM_GOAL = '__custom__'
const GOAL_PRESETS = ['Increase brand awareness', 'Generate leads', 'Drive sales', 'Build community', 'Improve engagement']
const CHANNEL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'German' },
  { code: 'ru', label: 'Russian' },
  { code: 'lv', label: 'Latvian' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'et', label: 'Estonian' },
  { code: 'pl', label: 'Polish' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'uk', label: 'Ukrainian' },
]
const STEPS = ['Knowledge', 'Brand DNA', 'Audiences', 'Voice', 'Positioning', 'Platforms', 'Rhythm & goals', 'Review']

const INPUT = 'w-full rounded-lg border border-dark-border bg-dark-surface2 px-3 py-2 text-sm text-white placeholder-t-secondary outline-none focus:border-violet-500'
const BTN_SECONDARY = 'rounded-lg border border-dark-border px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-dark-surface2 disabled:opacity-40'
const BTN_PRIMARY = 'flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50'

const s = (v: string | null | undefined): string => v ?? ''
const sl = (v: string[] | null | undefined): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : [])
const cap = (v: string): string => (v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ') : v)
const optList = (values: string[]) => values.map(v => ({ value: v, label: cap(v) }))
const recOpts = (rec: Record<string, string>) => Object.entries(rec).map(([value, label]) => ({ value, label }))
const toggleIn = (arr: string[], v: string): string[] => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
const snip = (t: string, n = 100): string => (t.trim() ? (t.length > n ? `${t.slice(0, n)}…` : t) : '—')

const PLATFORM_OPTS = PLATFORMS.map(pf => ({ value: pf, label: PLATFORM_META[pf]?.label ?? pf }))

function emptyAudience(): WizardAudience {
  return {
    name: '', job_role: '', industry: '', country: '', language: '', business_size: '',
    pain_points: [], goals: [], fears: [], objections: [], buying_triggers: [],
    emotional_triggers: [], rational_triggers: [], questions: [],
    content_they_trust: '', desired_transformation: '', preferred_platforms: [],
  }
}

function emptyChannel(platform: string): WizardChannel {
  return {
    active: false,
    label: PLATFORM_META[platform]?.label ?? platform,
    url: '', goal: '', role: '',
    audience_index: null,
    posts_per_week: 3,
    frequency: { mon: true, tue: false, wed: true, thu: false, fri: true, sat: false, sun: false },
    preferred_formats: [],
    emoji_policy: 'light',
    hashtag_policy: 'minimal',
    cta_style: '', visual_style: '', link_policy: '', tone_override: '',
  }
}

function emptyForm(): WizardForm {
  return {
    name: '',
    primary_goal: GOAL_PRESETS[0],
    primary_goal_custom: false,
    default_language: 'en',
    knowledge_sources: { use_faq: true, use_knowledge_base: true, use_company_settings: true, use_services: true },
    brand_summary: '', usp: '', mission: '', brand_promise: '', differentiators: '',
    brand_values: [], proof_points: [], price_position: 'mid_market', main_cta: '', important_links: [],
    audiences: [],
    voice: {
      tone: 'professional', formality_level: 'balanced', sentence_style: 'balanced', point_of_view: 'brand',
      emoji_policy: 'light', hashtag_policy: 'minimal', preferred_words: [], forbidden_words: [], claims_to_avoid: [],
    },
    positioning: { old_way: '', new_way: '', transformation: '', beliefs: [] },
    key_messages: [],
    channels: Object.fromEntries(PLATFORMS.map(pf => [pf, emptyChannel(pf)] as [string, WizardChannel])),
    weekly_rhythm: Object.fromEntries(
      WEEKDAYS.map(d => [d, { role: DEFAULT_RHYTHM[d].role, notes: DEFAULT_RHYTHM[d].notes }] as [string, { role: string; notes: string }]),
    ),
    content_mix: { ...DEFAULT_MIX },
    mix_ai: true,
    engagement_goals: [],
    trend_mode: 'evergreen',
    visual: { style: 'premium', image_types: [], avoid: [], aspect_ratios: [], colors: [] },
  }
}

function fromProfile(p: PlannerProfile): WizardForm {
  const base = emptyForm()
  const voice = p.brand_voices?.[0]
  const ks = p.knowledge_sources ?? {}
  const audiences: WizardAudience[] = (p.audiences ?? []).map((a: Audience) => ({
    name: s(a.name), job_role: s(a.job_role), industry: s(a.industry), country: s(a.country),
    language: s(a.language), business_size: s(a.business_size),
    pain_points: sl(a.pain_points), goals: sl(a.goals), fears: sl(a.fears), objections: sl(a.objections),
    buying_triggers: sl(a.buying_triggers), emotional_triggers: sl(a.emotional_triggers),
    rational_triggers: sl(a.rational_triggers), questions: sl(a.questions),
    content_they_trust: s(a.content_they_trust), desired_transformation: s(a.desired_transformation),
    preferred_platforms: sl(a.preferred_platforms),
  }))
  const channels = { ...base.channels }
  ;(p.channels ?? []).forEach((ch: Channel) => {
    if (!channels[ch.platform]) return
    const byId = ch.audience_id != null ? (p.audiences ?? []).findIndex(a => a.id === ch.audience_id) : -1
    channels[ch.platform] = {
      active: !!ch.active,
      label: ch.label || PLATFORM_META[ch.platform]?.label || ch.platform,
      url: s(ch.url), goal: s(ch.goal), role: s(ch.role),
      audience_index: byId >= 0 ? byId : ch.audience_index ?? null,
      posts_per_week: ch.posts_per_week ?? 3,
      frequency: { ...emptyChannel(ch.platform).frequency, ...(ch.frequency ?? {}) },
      preferred_formats: sl(ch.preferred_formats),
      emoji_policy: ch.emoji_policy || 'light',
      hashtag_policy: ch.hashtag_policy || 'minimal',
      cta_style: s(ch.cta_style), visual_style: s(ch.visual_style),
      link_policy: s(ch.link_policy), tone_override: s(ch.tone_override),
    }
  })
  const goal = s(p.primary_goal) || GOAL_PRESETS[0]
  return {
    ...base,
    name: s(p.name),
    primary_goal: goal,
    primary_goal_custom: !GOAL_PRESETS.includes(goal),
    default_language: p.default_language || 'en',
    knowledge_sources: {
      use_faq: ks.use_faq ?? true,
      use_knowledge_base: ks.use_knowledge_base ?? true,
      use_company_settings: ks.use_company_settings ?? true,
      use_services: ks.use_services ?? true,
    },
    brand_summary: s(p.brand_summary), usp: s(p.usp), mission: s(p.mission),
    brand_promise: s(p.brand_promise), differentiators: s(p.differentiators),
    brand_values: sl(p.brand_values), proof_points: sl(p.proof_points),
    price_position: p.price_position || base.price_position,
    main_cta: s(p.main_cta), important_links: sl(p.important_links),
    audiences,
    channels,
    voice: {
      tone: voice?.tone || p.default_tone || 'professional',
      formality_level: voice?.formality_level || 'balanced',
      sentence_style: voice?.sentence_style || 'balanced',
      point_of_view: voice?.point_of_view || 'brand',
      emoji_policy: voice?.emoji_policy || 'light',
      hashtag_policy: voice?.hashtag_policy || 'minimal',
      preferred_words: sl(voice?.preferred_words),
      forbidden_words: sl(voice?.forbidden_words),
      claims_to_avoid: sl(voice?.claims_to_avoid),
    },
    positioning: {
      old_way: s(p.positioning?.old_way), new_way: s(p.positioning?.new_way),
      transformation: s(p.positioning?.transformation), beliefs: sl(p.positioning?.beliefs),
    },
    key_messages: sl(p.key_messages),
    weekly_rhythm: Object.fromEntries(
      WEEKDAYS.map(d => {
        const r = p.weekly_rhythm?.[d]
        return [d, { role: r?.role || DEFAULT_RHYTHM[d].role, notes: r?.notes ?? '' }] as [string, { role: string; notes: string }]
      }),
    ),
    content_mix: p.content_mix && Object.keys(p.content_mix).length ? { ...p.content_mix } : { ...DEFAULT_MIX },
    mix_ai: !(p.content_mix && Object.keys(p.content_mix).length),
    engagement_goals: sl(p.engagement_goals),
    trend_mode: p.trend_mode || 'evergreen',
    visual: {
      style: p.visual_style?.style || 'premium',
      image_types: sl(p.visual_style?.image_types),
      avoid: sl(p.visual_style?.avoid),
      aspect_ratios: sl(p.visual_style?.aspect_ratios),
      colors: sl(p.visual_style?.colors),
    },
  }
}

function loadDraft(): { step: number; form: WizardForm } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { step?: number; form?: Partial<WizardForm> }
    if (!parsed || typeof parsed !== 'object' || !parsed.form) return null
    const base = emptyForm()
    const f = parsed.form
    const form: WizardForm = {
      ...base,
      ...f,
      knowledge_sources: { ...base.knowledge_sources, ...(f.knowledge_sources ?? {}) },
      voice: { ...base.voice, ...(f.voice ?? {}) },
      positioning: { ...base.positioning, ...(f.positioning ?? {}) },
      visual: { ...base.visual, ...(f.visual ?? {}) },
      weekly_rhythm: Object.fromEntries(
        WEEKDAYS.map(d => [d, { ...base.weekly_rhythm[d], ...((f.weekly_rhythm ?? {})[d] ?? {}) }] as [string, { role: string; notes: string }]),
      ),
      content_mix: f.content_mix && Object.keys(f.content_mix).length ? { ...f.content_mix } : { ...base.content_mix },
      channels: Object.fromEntries(
        PLATFORMS.map(pf => [pf, { ...base.channels[pf], ...((f.channels ?? {})[pf] ?? {}) }] as [string, WizardChannel]),
      ),
      audiences: Array.isArray(f.audiences) ? f.audiences.map(a => ({ ...emptyAudience(), ...a })) : [],
    }
    const step = typeof parsed.step === 'number' ? Math.min(STEPS.length - 1, Math.max(0, parsed.step)) : 0
    return { step, form }
  } catch {
    return null
  }
}

function normalizeMix(mix: Record<string, number>): Record<string, number> {
  const entries = Object.entries(mix).filter(([, v]) => v > 0)
  if (!entries.length) return { ...DEFAULT_MIX }
  const total = entries.reduce((sum, [, v]) => sum + v, 0)
  const scaled = entries.map(([k, v]) => [k, Math.max(1, Math.round((v / total) * 100))] as [string, number])
  scaled.sort((a, b) => b[1] - a[1])
  const diff = 100 - scaled.reduce((sum, [, v]) => sum + v, 0)
  scaled[0][1] = Math.max(1, scaled[0][1] + diff)
  return Object.fromEntries(scaled)
}

function buildPayload(form: WizardForm): Record<string, unknown> {
  // Audiences without a name are dropped; remap channel audience_index accordingly.
  const keptIdx: number[] = []
  const audiences = form.audiences.filter((a, i) => {
    const keep = a.name.trim().length > 0
    if (keep) keptIdx.push(i)
    return keep
  })
  const idxMap = new Map(keptIdx.map((oldI, newI) => [oldI, newI] as [number, number]))
  const channels = PLATFORMS.filter(pf => form.channels[pf]?.active).map(pf => {
    const c = form.channels[pf]
    return {
      platform: pf,
      label: c.label.trim() || PLATFORM_META[pf]?.label || pf,
      url: c.url, goal: c.goal, role: c.role,
      audience_index: c.audience_index != null ? idxMap.get(c.audience_index) ?? null : null,
      posts_per_week: Math.min(14, Math.max(1, Math.round(c.posts_per_week) || 3)),
      frequency: c.frequency,
      preferred_formats: c.preferred_formats,
      emoji_policy: c.emoji_policy,
      hashtag_policy: c.hashtag_policy,
      cta_style: c.cta_style, visual_style: c.visual_style,
      link_policy: c.link_policy, tone_override: c.tone_override,
      active: true,
    }
  })
  return {
    name: form.name.trim(),
    default_language: form.default_language.trim() || 'en',
    default_tone: form.voice.tone,
    primary_goal: form.primary_goal.trim() || null,
    secondary_goals: [],
    knowledge_sources: form.knowledge_sources,
    use_existing_knowledge: Object.values(form.knowledge_sources).some(Boolean),
    brand_summary: form.brand_summary || null,
    usp: form.usp || null,
    mission: form.mission || null,
    brand_values: form.brand_values,
    brand_promise: form.brand_promise || null,
    differentiators: form.differentiators || null,
    proof_points: form.proof_points,
    price_position: form.price_position || null,
    main_cta: form.main_cta || null,
    important_links: form.important_links,
    positioning: form.positioning,
    key_messages: form.key_messages,
    content_mix: form.mix_ai ? {} : Object.fromEntries(Object.entries(form.content_mix).filter(([, v]) => v > 0)),
    weekly_rhythm: form.weekly_rhythm,
    engagement_goals: form.engagement_goals,
    visual_style: form.visual,
    trend_mode: form.trend_mode,
    setup_step: 8,
    brand_voice: form.voice,
    audiences: audiences.map(a => ({ ...a, name: a.name.trim() })),
    channels,
  }
}

/* ─── Small reusable UI pieces ───────────────────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-white">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-t-secondary">{hint}</p>}
    </div>
  )
}

function StepIntro({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-0.5 text-sm text-t-secondary">{desc}</p>
    </div>
  )
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const t = raw.trim()
    if (t && !value.includes(t)) onChange([...value, t])
    setText('')
  }
  return (
    <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg border border-dark-border bg-dark-surface2 px-2 py-1.5">
      {value.map((tag, i) => (
        <span key={`${tag}-${i}`} className="inline-flex items-center gap-1 rounded bg-violet-600/20 px-2 py-0.5 text-xs text-violet-200">
          {tag}
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-violet-300 hover:text-white">
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={e => {
          const v = e.target.value
          if (v.endsWith(',')) add(v.slice(0, -1))
          else setText(v)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); add(text) }
          if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => { if (text.trim()) add(text) }}
        placeholder={value.length ? '' : placeholder}
        className="min-w-[110px] flex-1 bg-transparent py-0.5 text-sm text-white placeholder-t-secondary outline-none"
      />
    </div>
  )
}

function Segmented({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-dark-border bg-dark-surface2 p-1">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.value ? 'bg-violet-600 text-white' : 'text-t-secondary hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Chips({ options, selected, onToggle }: { options: { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = selected.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              on ? 'border-violet-500 bg-violet-600/20 text-violet-200' : 'border-dark-border bg-dark-surface2 text-t-secondary hover:text-white'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-violet-600' : 'bg-dark-border'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

function ToggleCard({ title, desc, checked, onToggle }: { title: string; desc: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-lg border p-3 text-left transition-colors ${
        checked ? 'border-violet-500 bg-violet-600/10' : 'border-dark-border bg-dark-surface2 hover:border-violet-500/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white">{title}</span>
        <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${checked ? 'border-violet-500 bg-violet-600 text-white' : 'border-dark-border'}`}>
          {checked && <Check size={10} />}
        </span>
      </div>
      <p className="mt-1 text-xs text-t-secondary">{desc}</p>
    </button>
  )
}

function Stepper({ current, onJump }: { current: number; onJump: (i: number) => void }) {
  return (
    <div className="flex items-start gap-0.5 overflow-x-auto pb-1">
      {STEPS.map((label, i) => (
        <div key={label} className="flex min-w-[62px] flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-center">
            <div className={`h-px flex-1 ${i === 0 ? 'bg-transparent' : i <= current ? 'bg-violet-500' : 'bg-dark-border'}`} />
            <button
              type="button"
              onClick={() => onJump(i)}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                i === current
                  ? 'border-violet-500 bg-violet-600 text-white'
                  : i < current
                    ? 'border-violet-500/60 bg-violet-600/20 text-violet-300'
                    : 'border-dark-border bg-dark-surface2 text-t-secondary hover:text-white'
              }`}
            >
              {i < current ? <Check size={12} /> : i + 1}
            </button>
            <div className={`h-px flex-1 ${i === STEPS.length - 1 ? 'bg-transparent' : i < current ? 'bg-violet-500' : 'bg-dark-border'}`} />
          </div>
          <span className={`text-center text-[10px] leading-tight ${i === current ? 'font-medium text-white' : 'text-t-secondary'}`}>{label}</span>
        </div>
      ))}
    </div>
  )
}

function ReadinessBars({ readiness }: { readiness: ReadinessData }) {
  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">AI readiness</h4>
        <span className={`text-sm font-bold ${readiness.overall >= 70 ? 'text-green-400' : readiness.overall >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
          {readiness.overall}%
        </span>
      </div>
      <div className="space-y-2">
        {readiness.sections.map(sec => (
          <div key={sec.key}>
            <div className="flex justify-between text-xs">
              <span className="text-t-secondary">{sec.label}</span>
              <span className="text-white">{sec.score}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-dark-border">
              <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${Math.min(100, Math.max(0, sec.score))}%` }} />
            </div>
            {sec.hints.length > 0 && <p className="mt-0.5 text-[11px] text-amber-400/90">{sec.hints.join(' · ')}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <button type="button" onClick={onEdit} className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300">
          <Pencil size={11} /> Edit
        </button>
      </div>
      <div className="space-y-1 text-xs text-t-secondary">{children}</div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <p>
      <span className="font-medium text-white">{k}:</span> {v}
    </p>
  )
}

/* ─── Step 1 — Knowledge sources ─────────────────────────────────── */

function Step1Knowledge({ form, up, detected }: StepProps & { detected?: Detected }) {
  const ks = form.knowledge_sources
  const setKs = (key: keyof WizardForm['knowledge_sources']) => up({ knowledge_sources: { ...ks, [key]: !ks[key] } })
  const faqCount = detected?.sources?.faq_count ?? detected?.faq?.length ?? 0
  const svcCount = detected?.services?.length ?? 0
  const org = detected?.organization
  return (
    <div className="space-y-5">
      <StepIntro title="Knowledge sources" desc="Name your plan, pick your main goal and tell the AI what it can learn from automatically." />
      {detected && (
        <div className="rounded-lg border border-violet-500/30 bg-violet-600/10 p-3">
          <h4 className="text-sm font-semibold text-white">What we already know</h4>
          <div className="mt-2 space-y-1 text-xs text-t-secondary">
            {org?.name && <p>Organization: <span className="text-white">{org.name}</span></p>}
            {org?.industry && <p>Industry: <span className="text-white">{org.industry}</span></p>}
            {org?.website && <p>Website: <span className="text-white">{org.website}</span></p>}
            <p>FAQ entries found: <span className="text-white">{faqCount}</span></p>
            <p>Services found: <span className="text-white">{svcCount}</span></p>
          </div>
          {!!detected.missing_fields?.length && (
            <div className="mt-2 space-y-0.5">
              {detected.missing_fields.map(f => (
                <p key={f} className="text-xs text-amber-400">Missing: {f}</p>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Profile name *">
          <input className={INPUT} value={form.name} onChange={e => up({ name: e.target.value })} placeholder="e.g. Main content plan" />
        </Field>
        <Field label="Default language" hint="The main language your content is written in">
          <select className={INPUT} value={form.default_language || 'en'} onChange={e => up({ default_language: e.target.value })}>
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label} ({l.code})</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Primary goal">
        <select
          className={INPUT}
          value={form.primary_goal_custom ? CUSTOM_GOAL : form.primary_goal}
          onChange={e => {
            if (e.target.value === CUSTOM_GOAL) up({ primary_goal_custom: true, primary_goal: '' })
            else up({ primary_goal_custom: false, primary_goal: e.target.value })
          }}
        >
          {GOAL_PRESETS.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
          <option value={CUSTOM_GOAL}>Something else…</option>
        </select>
        {form.primary_goal_custom && (
          <input
            className={`${INPUT} mt-2`}
            value={form.primary_goal}
            onChange={e => up({ primary_goal: e.target.value })}
            placeholder="Describe your main goal in your own words"
          />
        )}
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium text-white">What should the AI learn from?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleCard title="AI chat FAQ" desc="Questions your customers actually ask — the highest-value source." checked={ks.use_faq} onToggle={() => setKs('use_faq')} />
          <ToggleCard title="Knowledge base" desc="Articles from your AI chat widget knowledge base." checked={ks.use_knowledge_base} onToggle={() => setKs('use_knowledge_base')} />
          <ToggleCard title="Company settings" desc="General company profile, branding and industry info." checked={ks.use_company_settings} onToggle={() => setKs('use_company_settings')} />
          <ToggleCard title="Services & products" desc="Your services list for product context and offers." checked={ks.use_services} onToggle={() => setKs('use_services')} />
        </div>
      </div>
    </div>
  )
}

/* ─── Step 2 — Brand DNA ─────────────────────────────────────────── */

function Step2Brand({ form, up }: StepProps) {
  return (
    <div className="space-y-5">
      <StepIntro title="Brand DNA" desc="Who you are, what you promise, and why anyone should care. Skip what you don't know — the AI marks its assumptions." />
      <Field label="Brand summary" hint="What does the company do, for whom, and why does it matter?">
        <textarea className={`${INPUT} min-h-[80px]`} value={form.brand_summary} onChange={e => up({ brand_summary: e.target.value })} placeholder="We help… by… so that…" />
      </Field>
      <Field label="USP — what makes you different" hint="The one thing competitors can't honestly say.">
        <textarea className={`${INPUT} min-h-[70px]`} value={form.usp} onChange={e => up({ usp: e.target.value })} placeholder="The only… / Unlike others, we…" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mission">
          <input className={INPUT} value={form.mission} onChange={e => up({ mission: e.target.value })} placeholder="Why the company exists" />
        </Field>
        <Field label="Brand promise">
          <input className={INPUT} value={form.brand_promise} onChange={e => up({ brand_promise: e.target.value })} placeholder="What customers can always count on" />
        </Field>
      </div>
      <Field label="Differentiators" hint="What you do differently — process, people, technology, guarantees.">
        <textarea className={`${INPUT} min-h-[70px]`} value={form.differentiators} onChange={e => up({ differentiators: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand values" hint="Press Enter or comma to add.">
          <TagInput value={form.brand_values} onChange={v => up({ brand_values: v })} placeholder="e.g. transparency" />
        </Field>
        <Field label="Proof points" hint="Numbers, awards, results, well-known clients.">
          <TagInput value={form.proof_points} onChange={v => up({ proof_points: v })} placeholder="e.g. 500+ hotels served" />
        </Field>
      </div>
      <Field label="Price position">
        <Segmented options={recOpts(PRICE_POSITIONS)} value={form.price_position} onChange={v => up({ price_position: v })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Main call to action">
          <input className={INPUT} value={form.main_cta} onChange={e => up({ main_cta: e.target.value })} placeholder="e.g. Book a demo" />
        </Field>
        <Field label="Important links" hint="Website, booking page, demo link…">
          <TagInput value={form.important_links} onChange={v => up({ important_links: v })} placeholder="https://…" />
        </Field>
      </div>
    </div>
  )
}

/* ─── Step 3 — Audiences ─────────────────────────────────────────── */

function AudienceCard({ value, index, onChange, onRemove }: { value: WizardAudience; index: number; onChange: (a: WizardAudience) => void; onRemove: () => void }) {
  const [more, setMore] = useState(false)
  const set = (patch: Partial<WizardAudience>) => onChange({ ...value, ...patch })
  return (
    <div className="space-y-3 rounded-lg border border-dark-border bg-dark-surface2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-t-secondary">Segment {index + 1}</span>
        <button type="button" onClick={onRemove} className="text-t-secondary transition-colors hover:text-red-400" title="Remove segment">
          <Trash2 size={14} />
        </button>
      </div>
      <Field label="Name *">
        <input className={INPUT} value={value.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Independent hotel owners" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Job role / customer type">
          <input className={INPUT} value={value.job_role} onChange={e => set({ job_role: e.target.value })} placeholder="e.g. GM, owner, marketer" />
        </Field>
        <Field label="Industry">
          <input className={INPUT} value={value.industry} onChange={e => set({ industry: e.target.value })} />
        </Field>
        <Field label="Country / region">
          <input className={INPUT} value={value.country} onChange={e => set({ country: e.target.value })} />
        </Field>
        <Field label="Language">
          <input className={INPUT} value={value.language} onChange={e => set({ language: e.target.value })} placeholder="en" />
        </Field>
        <Field label="Business size (if B2B)">
          <input className={INPUT} value={value.business_size} onChange={e => set({ business_size: e.target.value })} placeholder="e.g. 10-50 rooms" />
        </Field>
      </div>
      <Field label="Pain points">
        <TagInput value={value.pain_points} onChange={v => set({ pain_points: v })} placeholder="What keeps them up at night…" />
      </Field>
      <Field label="Goals & desires">
        <TagInput value={value.goals} onChange={v => set({ goals: v })} placeholder="What they want to achieve…" />
      </Field>
      <Field label="Preferred platforms">
        <Chips options={PLATFORM_OPTS} selected={value.preferred_platforms} onToggle={pf => set({ preferred_platforms: toggleIn(value.preferred_platforms, pf) })} />
      </Field>
      <button type="button" onClick={() => setMore(m => !m)} className="flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300">
        {more ? <ChevronUp size={13} /> : <ChevronDown size={13} />} More psychology fields
      </button>
      {more && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fears">
              <TagInput value={value.fears} onChange={v => set({ fears: v })} placeholder="What they're afraid of…" />
            </Field>
            <Field label="Objections">
              <TagInput value={value.objections} onChange={v => set({ objections: v })} placeholder="Why they hesitate to buy…" />
            </Field>
            <Field label="Buying triggers">
              <TagInput value={value.buying_triggers} onChange={v => set({ buying_triggers: v })} placeholder="What makes them act now…" />
            </Field>
            <Field label="Emotional triggers">
              <TagInput value={value.emotional_triggers} onChange={v => set({ emotional_triggers: v })} placeholder="e.g. pride, fear of falling behind" />
            </Field>
            <Field label="Rational triggers">
              <TagInput value={value.rational_triggers} onChange={v => set({ rational_triggers: v })} placeholder="e.g. ROI, time saved" />
            </Field>
            <Field label="Questions they ask before buying">
              <TagInput value={value.questions} onChange={v => set({ questions: v })} placeholder="e.g. How long is setup?" />
            </Field>
          </div>
          <Field label="Content they trust" hint="What content already earns their trust — formats, sources, styles.">
            <textarea className={`${INPUT} min-h-[60px]`} value={value.content_they_trust} onChange={e => set({ content_they_trust: e.target.value })} />
          </Field>
          <Field label="Desired transformation" hint="From where to where do they want to move?">
            <textarea className={`${INPUT} min-h-[60px]`} value={value.desired_transformation} onChange={e => set({ desired_transformation: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  )
}

function Step3Audiences({ form, up }: StepProps) {
  const setAud = (i: number, a: WizardAudience) => up({ audiences: form.audiences.map((x, j) => (j === i ? a : x)) })
  const removeAud = (i: number) => {
    const channels = Object.fromEntries(
      Object.entries(form.channels).map(([pf, c]) => {
        let ai = c.audience_index
        if (ai != null) {
          if (ai === i) ai = null
          else if (ai > i) ai = ai - 1
        }
        return [pf, { ...c, audience_index: ai }] as [string, WizardChannel]
      }),
    )
    up({ audiences: form.audiences.filter((_, j) => j !== i), channels })
  }
  return (
    <div className="space-y-4">
      <StepIntro title="Audience intelligence" desc="Define who you're talking to. Even one well-described segment makes every post dramatically sharper." />
      {form.audiences.length === 0 && (
        <div className="rounded-lg border border-dashed border-dark-border p-6 text-center">
          <p className="text-sm text-t-secondary">No segments yet — the AI will assume a general audience and mark its assumptions.</p>
          <p className="mt-1 text-xs text-t-secondary">Add at least one segment for sharper, more specific content.</p>
        </div>
      )}
      {form.audiences.map((a, i) => (
        <AudienceCard key={i} value={a} index={i} onChange={next => setAud(i, next)} onRemove={() => removeAud(i)} />
      ))}
      {form.audiences.length < 5 && (
        <button
          type="button"
          onClick={() => up({ audiences: [...form.audiences, emptyAudience()] })}
          className="flex items-center gap-1.5 rounded-lg border border-dark-border px-3 py-2 text-sm font-medium text-white transition-colors hover:border-violet-500/50 hover:bg-dark-surface2"
        >
          <Plus size={14} /> Add audience segment
        </button>
      )}
    </div>
  )
}

/* ─── Step 4 — Brand voice ───────────────────────────────────────── */

function Step4Voice({ form, up }: StepProps) {
  const upVoice = (patch: Partial<WizardVoice>) => up({ voice: { ...form.voice, ...patch } })
  return (
    <div className="space-y-5">
      <StepIntro title="Brand voice & personality" desc="How the brand sounds — the AI follows these rules in every post." />
      <Field label="Tone">
        <Chips options={optList(TONES)} selected={[form.voice.tone]} onToggle={t => upVoice({ tone: t })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Formality">
          <Segmented options={optList(FORMALITY_LEVELS)} value={form.voice.formality_level} onChange={v => upVoice({ formality_level: v })} />
        </Field>
        <Field label="Sentence style">
          <Segmented options={optList(SENTENCE_STYLES)} value={form.voice.sentence_style} onChange={v => upVoice({ sentence_style: v })} />
        </Field>
        <Field label="Point of view">
          <Segmented options={optList(POINTS_OF_VIEW)} value={form.voice.point_of_view} onChange={v => upVoice({ point_of_view: v })} />
        </Field>
        <Field label="Emoji policy">
          <Segmented options={optList(EMOJI_POLICIES)} value={form.voice.emoji_policy} onChange={v => upVoice({ emoji_policy: v })} />
        </Field>
        <Field label="Hashtag policy">
          <Segmented options={optList(HASHTAG_POLICIES)} value={form.voice.hashtag_policy} onChange={v => upVoice({ hashtag_policy: v })} />
        </Field>
      </div>
      <Field label="Preferred words & phrases">
        <TagInput value={form.voice.preferred_words} onChange={v => upVoice({ preferred_words: v })} placeholder="Words the brand loves…" />
      </Field>
      <Field label="Forbidden words">
        <TagInput value={form.voice.forbidden_words} onChange={v => upVoice({ forbidden_words: v })} placeholder="e.g. cheap, revolutionary, game-changer" />
      </Field>
      <Field label="Claims to avoid" hint="Things the brand must never claim — legal, factual or positioning limits.">
        <TagInput value={form.voice.claims_to_avoid} onChange={v => upVoice({ claims_to_avoid: v })} placeholder="e.g. guaranteed results" />
      </Field>
    </div>
  )
}

/* ─── Step 5 — Positioning ───────────────────────────────────────── */

function Step5Positioning({ form, up }: StepProps) {
  const upPos = (patch: Partial<WizardForm['positioning']>) => up({ positioning: { ...form.positioning, ...patch } })
  return (
    <div className="space-y-5">
      <StepIntro title="Positioning & narrative" desc="The story your content keeps telling: the old way is broken, you represent the new way." />
      <Field label="What old way is broken?">
        <textarea
          className={`${INPUT} min-h-[70px]`}
          value={form.positioning.old_way}
          onChange={e => upPos({ old_way: e.target.value })}
          placeholder="e.g. Hotels lose direct bookings because guest communication is slow and fragmented."
        />
      </Field>
      <Field label="What new way do we represent?">
        <textarea
          className={`${INPUT} min-h-[70px]`}
          value={form.positioning.new_way}
          onChange={e => upPos({ new_way: e.target.value })}
          placeholder="e.g. AI handles repetitive communication instantly while the team focuses on hospitality."
        />
      </Field>
      <Field label="What transformation do we promise?">
        <textarea
          className={`${INPUT} min-h-[70px]`}
          value={form.positioning.transformation}
          onChange={e => upPos({ transformation: e.target.value })}
          placeholder="Where does the customer end up after working with you?"
        />
      </Field>
      <Field label="Beliefs the brand repeats" hint="Press Enter or comma to add.">
        <TagInput value={form.positioning.beliefs} onChange={v => upPos({ beliefs: v })} placeholder="e.g. Hospitality is human — admin isn't" />
      </Field>
      <Field label="Key messages" hint="Messages to repeat again and again.">
        <TagInput value={form.key_messages} onChange={v => up({ key_messages: v })} placeholder="Add a key message…" />
      </Field>
    </div>
  )
}

/* ─── Step 6 — Platforms ─────────────────────────────────────────── */

function PlatformCard({ platform, channel, audiences, onChange }: { platform: string; channel: WizardChannel; audiences: WizardAudience[]; onChange: (c: WizardChannel) => void }) {
  const meta = PLATFORM_META[platform]
  const set = (patch: Partial<WizardChannel>) => onChange({ ...channel, ...patch })
  return (
    <div
      className={`rounded-lg border bg-dark-surface2 p-3 transition-colors ${channel.active ? 'border-violet-500/50 sm:col-span-2' : 'border-dark-border'}`}
      style={{ borderLeftColor: meta?.color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta?.color }} />
          <span className="text-sm font-medium text-white">{meta?.label ?? platform}</span>
        </div>
        <Toggle checked={channel.active} onChange={v => set({ active: v })} />
      </div>
      {channel.active && (
        <div className="mt-3 space-y-3 border-t border-dark-border pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Label">
              <input className={INPUT} value={channel.label} onChange={e => set({ label: e.target.value })} />
            </Field>
            <Field label="URL">
              <input className={INPUT} value={channel.url} onChange={e => set({ url: e.target.value })} placeholder="https://…" />
            </Field>
            <Field label="What is this platform for?">
              <input className={INPUT} value={channel.goal} onChange={e => set({ goal: e.target.value })} placeholder="e.g. reach decision makers" />
            </Field>
            <Field label="Role">
              <input className={INPUT} value={channel.role} onChange={e => set({ role: e.target.value })} placeholder="e.g. authority building" />
            </Field>
            <Field label="Posts per week">
              <input
                type="number"
                min={1}
                max={14}
                className={INPUT}
                value={channel.posts_per_week || ''}
                onChange={e => {
                  const n = parseInt(e.target.value, 10)
                  set({ posts_per_week: Number.isNaN(n) ? 0 : n })
                }}
              />
            </Field>
            <Field label="Audience segment">
              <select
                className={INPUT}
                value={channel.audience_index ?? ''}
                onChange={e => set({ audience_index: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">All audiences</option>
                {audiences.map((a, i) => (
                  <option key={i} value={i}>{a.name || `Segment ${i + 1}`}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Posting days">
            <div className="flex flex-wrap gap-1.5">
              {CHANNEL_DAYS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set({ frequency: { ...channel.frequency, [d]: !channel.frequency[d] } })}
                  className={`rounded-md border px-2 py-1 text-xs capitalize transition-colors ${
                    channel.frequency[d] ? 'border-violet-500 bg-violet-600/20 text-violet-200' : 'border-dark-border text-t-secondary hover:text-white'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Preferred formats" hint="e.g. carousel, text post, reel, article — press Enter to add.">
            <TagInput value={channel.preferred_formats} onChange={v => set({ preferred_formats: v })} placeholder="Add a format…" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Emoji policy">
              <Segmented options={optList(EMOJI_POLICIES)} value={channel.emoji_policy} onChange={v => set({ emoji_policy: v })} />
            </Field>
            <Field label="Hashtag policy">
              <Segmented options={optList(HASHTAG_POLICIES)} value={channel.hashtag_policy} onChange={v => set({ hashtag_policy: v })} />
            </Field>
            <Field label="CTA style">
              <input className={INPUT} value={channel.cta_style} onChange={e => set({ cta_style: e.target.value })} placeholder="e.g. soft question, comment prompt" />
            </Field>
            <Field label="Visual style">
              <select className={INPUT} value={channel.visual_style} onChange={e => set({ visual_style: e.target.value })}>
                <option value="">Brand default</option>
                {VISUAL_STYLES.map(v => (
                  <option key={v} value={v}>{cap(v)}</option>
                ))}
              </select>
            </Field>
            <Field label="Link policy">
              <input className={INPUT} value={channel.link_policy} onChange={e => set({ link_policy: e.target.value })} placeholder="e.g. link in first comment" />
            </Field>
            <Field label="Tone override">
              <select className={INPUT} value={channel.tone_override} onChange={e => set({ tone_override: e.target.value })}>
                <option value="">Brand default</option>
                {TONES.map(t => (
                  <option key={t} value={t}>{cap(t)}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}

function Step6Platforms({ form, up }: StepProps) {
  const setChannel = (pf: string, ch: WizardChannel) => up({ channels: { ...form.channels, [pf]: ch } })
  return (
    <div className="space-y-4">
      <StepIntro title="Social channel strategy" desc="Activate the platforms you actually use — each one gets its own purpose, frequency and rules." />
      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map(pf => (
          <PlatformCard key={pf} platform={pf} channel={form.channels[pf]} audiences={form.audiences} onChange={ch => setChannel(pf, ch)} />
        ))}
      </div>
    </div>
  )
}

/* ─── Step 7 — Rhythm & goals ────────────────────────────────────── */

function Step7Rhythm({ form, up }: StepProps) {
  const total = Object.values(form.content_mix).reduce((a, b) => a + (b || 0), 0)
  const setMix = (k: string, v: number) => up({ content_mix: { ...form.content_mix, [k]: Math.max(0, Math.min(100, v)) } })
  const setRhythm = (d: string, patch: Partial<{ role: string; notes: string }>) =>
    up({ weekly_rhythm: { ...form.weekly_rhythm, [d]: { ...form.weekly_rhythm[d], ...patch } } })
  const upVisual = (patch: Partial<WizardForm['visual']>) => up({ visual: { ...form.visual, ...patch } })
  return (
    <div className="space-y-6">
      <StepIntro title="Rhythm & goals" desc="Give every weekday a job, balance your content mix, and tell the AI what engagement actually matters." />

      <div>
        <h4 className="mb-2 text-sm font-semibold text-white">Weekly rhythm</h4>
        <div className="space-y-2">
          {WEEKDAYS.map(d => (
            <div key={d} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="w-24 shrink-0 text-sm capitalize text-white">{d}</span>
              <select
                className={`${INPUT} sm:w-60`}
                value={form.weekly_rhythm[d].role}
                onChange={e => setRhythm(d, { role: e.target.value })}
                title={WEEKDAY_ROLE_META[form.weekly_rhythm[d].role]?.desc}
              >
                {Object.entries(WEEKDAY_ROLE_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </select>
              <input
                className={`${INPUT} flex-1`}
                value={form.weekly_rhythm[d].notes}
                onChange={e => setRhythm(d, { notes: e.target.value })}
                placeholder="Notes (optional)"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-white">Content mix</h4>
          {!form.mix_ai && (
            <div className="flex items-center gap-3">
              <span className={`text-sm font-bold ${total === 100 ? 'text-green-400' : 'text-amber-400'}`}>Total: {total}%</span>
              <button type="button" onClick={() => up({ content_mix: normalizeMix(form.content_mix) })} className="text-xs text-violet-400 hover:text-violet-300">
                Balance to 100%
              </button>
            </div>
          )}
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => up({ mix_ai: true })}
            className={`rounded-lg border p-3 text-left transition-colors ${form.mix_ai ? 'border-violet-500/60 bg-violet-500/10' : 'border-dark-border bg-dark-surface hover:border-dark-border2'}`}
          >
            <p className="text-sm font-medium text-white">Let AI decide <span className="text-violet-300">(recommended)</span></p>
            <p className="mt-0.5 text-xs text-t-secondary">The strategy generator picks the best split for your brand.</p>
          </button>
          <button
            type="button"
            onClick={() => up({ mix_ai: false })}
            className={`rounded-lg border p-3 text-left transition-colors ${!form.mix_ai ? 'border-violet-500/60 bg-violet-500/10' : 'border-dark-border bg-dark-surface hover:border-dark-border2'}`}
          >
            <p className="text-sm font-medium text-white">Set manually</p>
            <p className="mt-0.5 text-xs text-t-secondary">Control the exact percentage of each content type.</p>
          </button>
        </div>
        {!form.mix_ai && (
        <div className="space-y-2">
          {Object.entries(MIX_CATEGORIES).map(([k, label]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-44 shrink-0 truncate text-xs text-t-secondary" title={label}>{label}</span>
              <input type="range" min={0} max={60} step={5} value={form.content_mix[k] ?? 0} onChange={e => setMix(k, Number(e.target.value))} className="flex-1 accent-violet-500" />
              <input
                type="number"
                min={0}
                max={100}
                value={form.content_mix[k] ?? 0}
                onChange={e => setMix(k, Number(e.target.value) || 0)}
                className="w-16 rounded-md border border-dark-border bg-dark-surface2 px-2 py-1 text-right text-xs text-white outline-none focus:border-violet-500"
              />
            </div>
          ))}
        </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-white">Engagement goals</h4>
        <Chips options={recOpts(ENGAGEMENT_GOALS)} selected={form.engagement_goals} onToggle={g => up({ engagement_goals: toggleIn(form.engagement_goals, g) })} />
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-white">Trend mode</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(TREND_MODES).map(([k, m]) => (
            <button
              key={k}
              type="button"
              onClick={() => up({ trend_mode: k })}
              className={`rounded-lg border p-3 text-left transition-colors ${
                form.trend_mode === k ? 'border-violet-500 bg-violet-600/10' : 'border-dark-border bg-dark-surface2 hover:border-violet-500/40'
              }`}
            >
              <span className="text-sm font-medium text-white">{m.label}</span>
              <p className="mt-1 text-xs text-t-secondary">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-white">Visual style</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Style">
            <select className={INPUT} value={form.visual.style} onChange={e => upVisual({ style: e.target.value })}>
              {VISUAL_STYLES.map(v => (
                <option key={v} value={v}>{cap(v)}</option>
              ))}
            </select>
          </Field>
          <Field label="Brand colors" hint="e.g. #7c3aed, deep green">
            <TagInput value={form.visual.colors} onChange={v => upVisual({ colors: v })} placeholder="Add a color…" />
          </Field>
        </div>
        <Field label="Image types">
          <Chips options={IMAGE_TYPES.map(v => ({ value: v, label: cap(v) }))} selected={form.visual.image_types} onToggle={v => upVisual({ image_types: toggleIn(form.visual.image_types, v) })} />
        </Field>
        <Field label="Avoid in visuals">
          <TagInput value={form.visual.avoid} onChange={v => upVisual({ avoid: v })} placeholder="e.g. robots, generic stock photos" />
        </Field>
      </div>
    </div>
  )
}

/* ─── Step 8 — Review ────────────────────────────────────────────── */

function Step8Review({ form, readiness, onEdit }: { form: WizardForm; readiness?: ReadinessData | null; onEdit: (step: number) => void }) {
  const activePlatforms = PLATFORMS.filter(pf => form.channels[pf]?.active)
  const mixTotal = Object.values(form.content_mix).reduce((a, b) => a + (b || 0), 0)
  const sourceLabels = [
    form.knowledge_sources.use_faq && 'FAQ',
    form.knowledge_sources.use_knowledge_base && 'Knowledge base',
    form.knowledge_sources.use_company_settings && 'Company settings',
    form.knowledge_sources.use_services && 'Services',
  ].filter(Boolean) as string[]
  return (
    <div className="space-y-4">
      <StepIntro title="Review & save" desc="Check the essentials — you can edit any section now, and change everything later in Setup." />
      {!form.name.trim() && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-400">
          A profile name is required before saving — edit "Basics & knowledge" below.
        </p>
      )}
      <SummaryCard title="Basics & knowledge" onEdit={() => onEdit(0)}>
        <Row k="Name" v={form.name.trim() || '—'} />
        <Row k="Primary goal" v={form.primary_goal.trim() || '—'} />
        <Row k="Language" v={form.default_language.trim() || 'en'} />
        <Row k="Knowledge sources" v={sourceLabels.length ? sourceLabels.join(', ') : 'None — manual info only'} />
      </SummaryCard>
      <SummaryCard title="Brand DNA" onEdit={() => onEdit(1)}>
        <Row k="Summary" v={snip(form.brand_summary)} />
        <Row k="USP" v={snip(form.usp)} />
        <Row k="Price position" v={PRICE_POSITIONS[form.price_position] ?? '—'} />
        <Row k="Values" v={form.brand_values.length ? form.brand_values.join(', ') : '—'} />
        <Row k="Main CTA" v={form.main_cta.trim() || '—'} />
      </SummaryCard>
      <SummaryCard title="Audiences" onEdit={() => onEdit(2)}>
        {form.audiences.filter(a => a.name.trim()).length === 0 ? (
          <p>No segments — the AI will assume a general audience.</p>
        ) : (
          form.audiences.filter(a => a.name.trim()).map((a, i) => (
            <p key={i}>
              <span className="font-medium text-white">{a.name}</span> — {a.pain_points.length} pain points, {a.goals.length} goals
            </p>
          ))
        )}
      </SummaryCard>
      <SummaryCard title="Brand voice" onEdit={() => onEdit(3)}>
        <Row k="Tone" v={cap(form.voice.tone)} />
        <Row k="Formality" v={cap(form.voice.formality_level)} />
        <Row k="Point of view" v={cap(form.voice.point_of_view)} />
        <Row k="Emoji / hashtags" v={`${cap(form.voice.emoji_policy)} / ${cap(form.voice.hashtag_policy)}`} />
      </SummaryCard>
      <SummaryCard title="Positioning" onEdit={() => onEdit(4)}>
        <Row k="Old way" v={snip(form.positioning.old_way, 80)} />
        <Row k="New way" v={snip(form.positioning.new_way, 80)} />
        <Row k="Beliefs" v={form.positioning.beliefs.length ? `${form.positioning.beliefs.length} added` : '—'} />
        <Row k="Key messages" v={form.key_messages.length ? `${form.key_messages.length} added` : '—'} />
      </SummaryCard>
      <SummaryCard title="Platforms" onEdit={() => onEdit(5)}>
        {activePlatforms.length === 0 ? (
          <p className="text-amber-400">No active platforms — activate at least one so the calendar has somewhere to publish.</p>
        ) : (
          activePlatforms.map(pf => {
            const c = form.channels[pf]
            const days = CHANNEL_DAYS.filter(d => c.frequency[d])
            return (
              <p key={pf}>
                <span className="font-medium text-white">{c.label || PLATFORM_META[pf]?.label}</span> — {Math.min(14, Math.max(1, Math.round(c.posts_per_week) || 3))}/week
                {days.length ? ` (${days.join(', ')})` : ''}
              </p>
            )
          })
        )}
      </SummaryCard>
      <SummaryCard title="Rhythm & goals" onEdit={() => onEdit(6)}>
        <p>
          <span className="font-medium text-white">Content mix:</span>{' '}
          {form.mix_ai
            ? <span className="text-violet-300">AI decides (recommended)</span>
            : <><span className={mixTotal === 100 ? 'text-green-400' : 'text-amber-400'}>{mixTotal}%</span> allocated</>}
        </p>
        <Row k="Engagement goals" v={form.engagement_goals.length ? form.engagement_goals.map(g => ENGAGEMENT_GOALS[g] ?? g).join(', ') : '—'} />
        <Row k="Trend mode" v={TREND_MODES[form.trend_mode]?.label ?? cap(form.trend_mode)} />
        <Row k="Visual style" v={cap(form.visual.style)} />
      </SummaryCard>
      {readiness ? (
        <ReadinessBars readiness={readiness} />
      ) : (
        <p className="text-xs text-t-secondary">Your AI readiness score will be computed when you save.</p>
      )}
    </div>
  )
}

/* ─── Wizard shell ───────────────────────────────────────────────── */

export function SetupWizard({ existing, detected, onComplete }: { existing?: PlannerProfile | null; detected?: ProfileResponse['detected_knowledge']; onComplete: () => void }) {
  const queryClient = useQueryClient()
  const [initial] = useState(() => (existing ? { step: 0, form: fromProfile(existing) } : loadDraft() ?? { step: 0, form: emptyForm() }))
  const [step, setStep] = useState(initial.step)
  const [form, setForm] = useState<WizardForm>(initial.form)
  const [saved, setSaved] = useState(false)
  const [savedReadiness, setSavedReadiness] = useState<ReadinessData | null>(null)

  const up: Up = patch => setForm(f => ({ ...f, ...patch }))

  // Draft autosave (fresh setup only — Settings mode edits the live profile).
  useEffect(() => {
    if (existing) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, form }))
    } catch {
      /* storage unavailable — draft simply won't persist */
    }
  }, [existing, step, form])

  // Readiness preview on the review step (only meaningful when a profile already exists).
  const readinessPreview = useQuery({
    queryKey: ['content-planner-wizard-readiness'],
    queryFn: cp.getReadiness,
    enabled: step === STEPS.length - 1 && !!existing,
  })

  const finish = () => {
    queryClient.invalidateQueries()
    onComplete()
  }

  const save = useMutation({
    mutationFn: () => cp.saveProfile(buildPayload(form)),
    onSuccess: data => {
      toast.success(existing ? 'Content plan updated' : 'Content plan created')
      try {
        localStorage.removeItem(DRAFT_KEY)
      } catch {
        /* ignore */
      }
      setSavedReadiness((data as { readiness?: ReadinessData } | undefined)?.readiness ?? null)
      setSaved(true)
    },
    onError: e => toast.error(errMsg(e)),
  })

  const startOver = () => {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    setForm(emptyForm())
    setStep(0)
  }

  if (saved) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <div className="rounded-lg border border-dark-border bg-dark-surface p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-900/30">
            <Check size={24} className="text-green-400" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-white">{existing ? 'Strategy profile updated' : 'Your content strategy profile is ready'}</h2>
          <p className="mt-1 text-sm text-t-secondary">The AI will use this profile for strategies, calendars and every post it writes.</p>
          {savedReadiness && (
            <div className="mt-5 text-left">
              <ReadinessBars readiness={savedReadiness} />
            </div>
          )}
          <button type="button" onClick={finish} className={`${BTN_PRIMARY} mx-auto mt-6`}>
            Continue to planner
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-white">
            <Sparkles size={20} className="text-violet-400" />
            {existing ? 'Content strategy settings' : 'Set up your content strategy'}
          </h2>
          <p className="mt-1 text-sm text-t-secondary">
            Step {step + 1} of {STEPS.length} — {STEPS[step]}. Only the profile name is required; everything else sharpens the AI.
          </p>
        </div>
        {!existing && (
          <button type="button" onClick={startOver} className="flex shrink-0 items-center gap-1 text-xs text-t-secondary transition-colors hover:text-white">
            <RotateCcw size={12} /> Start over
          </button>
        )}
      </div>

      <Stepper current={step} onJump={setStep} />

      <div className="mt-4 rounded-lg border border-dark-border bg-dark-surface">
        <div className="max-h-[calc(100vh-330px)] min-h-[300px] overflow-y-auto p-4 sm:p-5">
          {step === 0 && <Step1Knowledge form={form} up={up} detected={detected} />}
          {step === 1 && <Step2Brand form={form} up={up} />}
          {step === 2 && <Step3Audiences form={form} up={up} />}
          {step === 3 && <Step4Voice form={form} up={up} />}
          {step === 4 && <Step5Positioning form={form} up={up} />}
          {step === 5 && <Step6Platforms form={form} up={up} />}
          {step === 6 && <Step7Rhythm form={form} up={up} />}
          {step === 7 && <Step8Review form={form} readiness={readinessPreview.data?.readiness ?? null} onEdit={setStep} />}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-dark-border p-4">
          <button type="button" onClick={() => setStep(v => Math.max(0, v - 1))} disabled={step === 0} className={BTN_SECONDARY}>
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep(v => Math.min(STEPS.length - 1, v + 1))}
              disabled={step === 0 && !form.name.trim()}
              title={step === 0 && !form.name.trim() ? 'Profile name is required' : undefined}
              className={BTN_PRIMARY}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending || !form.name.trim()}
              title={!form.name.trim() ? 'Profile name is required' : undefined}
              className={BTN_PRIMARY}
            >
              {save.isPending ? (
                <>
                  <Loader size={15} className="animate-spin" /> Saving…
                </>
              ) : existing ? (
                'Save changes'
              ) : (
                'Save & finish setup'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
