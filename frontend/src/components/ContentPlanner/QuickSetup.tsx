import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowRight, Check, Loader, Settings2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  cp, errMsg, GOAL_PRESETS, LANGUAGES, PLATFORM_META, PLATFORMS,
  type ProfileResponse, type Readiness,
} from './lib'

/**
 * Quick Start — the non-expert path. Four plain questions, then one AI call
 * builds the full brand profile (summary, USP, positioning, audience, voice)
 * from the company's existing FAQ / chatbot / org knowledge. The Advanced
 * 8-step wizard stays available behind a link for power users.
 */

const INTENSITIES: { key: string; label: string; desc: string }[] = [
  { key: 'light', label: 'Light', desc: '~2 posts / week per platform' },
  { key: 'standard', label: 'Standard', desc: '~3 posts / week per platform' },
  { key: 'active', label: 'Active', desc: '~5 posts / week per platform' },
]

const BUILD_STAGES = [
  'Reading your FAQ & company info…',
  'Understanding your customers…',
  'Defining your brand voice…',
  'Writing your positioning…',
  'Assembling the profile…',
]

const INPUT = 'w-full rounded-lg border border-dark-border bg-dark-surface2 px-3 py-2 text-sm text-white placeholder-t-secondary outline-none focus:border-violet-500'

export function QuickSetup({ detected, onComplete, onAdvanced }: {
  detected?: ProfileResponse['detected_knowledge']
  onComplete: () => void
  onAdvanced: () => void
}) {
  const orgName = detected?.organization?.name
  const [name, setName] = useState(orgName ? `${orgName} Content Plan` : 'My Content Plan')
  const [language, setLanguage] = useState('en')
  const [goal, setGoal] = useState(GOAL_PRESETS[0])
  const [platforms, setPlatforms] = useState<string[]>(['linkedin', 'instagram'])
  const [intensity, setIntensity] = useState('standard')
  const [stage, setStage] = useState(0)
  const [done, setDone] = useState<{ readiness?: Readiness; assumptions: string[] } | null>(null)

  const faqCount = detected?.sources?.faq_count ?? 0
  const hasKnowledge = faqCount > 0 || !!detected?.organization?.name

  const build = useMutation({
    mutationFn: () => cp.quickSetup({
      name: name.trim() || undefined,
      default_language: language,
      primary_goal: goal,
      platforms,
      intensity,
    }),
    onSuccess: (resp: { readiness?: Readiness; assumptions?: string[] }) => {
      setDone({ readiness: resp.readiness, assumptions: resp.assumptions ?? [] })
    },
    onError: e => toast.error(errMsg(e)),
  })

  // Cycle staged progress messages while the AI builds the profile.
  useEffect(() => {
    if (!build.isPending) return
    setStage(0)
    const t = setInterval(() => setStage(s => (s + 1) % BUILD_STAGES.length), 9000)
    return () => clearInterval(t)
  }, [build.isPending])

  const togglePlatform = (p: string) =>
    setPlatforms(cur => (cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p]))

  /* ── Success state: show what the AI assumed, then continue ── */
  if (done) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
        <div className="rounded-lg border border-dark-border bg-dark-surface p-6 sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-900/30">
            <Check size={24} className="text-green-400" />
          </div>
          <h2 className="mt-4 text-center text-xl font-semibold text-white">Your content plan is ready</h2>
          {done.readiness?.overall != null && (
            <p className="mt-1 text-center text-sm text-t-secondary">
              Profile readiness: <span className="font-semibold text-violet-300">{done.readiness.overall}%</span>
            </p>
          )}
          {done.assumptions.length > 0 && (
            <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-medium text-amber-300">The AI made these assumptions — correct any that are off in Setup:</p>
              <ul className="mt-2 space-y-1.5">
                {done.assumptions.map((a, i) => (
                  <li key={i} className="text-xs leading-relaxed text-amber-200/80">· {a}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 rounded-lg border border-violet-500/30 bg-violet-500/5 p-4 text-sm text-violet-200">
            <span className="font-semibold">Next:</span> generate your Strategy, then let the Calendar plan your month.
          </div>
          <button type="button" onClick={onComplete} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700">
            Continue to planner <ArrowRight size={15} />
          </button>
        </div>
      </div>
    )
  }

  /* ── Building state: staged progress ── */
  if (build.isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
        <div className="rounded-lg border border-dark-border bg-dark-surface p-8">
          <div className="flex items-center justify-center gap-2">
            <Sparkles size={20} className="text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Building your content plan…</h2>
          </div>
          <p className="mt-1 text-center text-xs text-t-secondary">Usually takes under a minute. Don't close this tab.</p>
          <div className="mx-auto mt-6 max-w-sm space-y-2.5">
            {BUILD_STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-2.5">
                {i < stage ? (
                  <Check size={14} className="shrink-0 text-green-400" />
                ) : i === stage ? (
                  <Loader size={14} className="shrink-0 animate-spin text-violet-400" />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-dark-border" />
                )}
                <span className={`text-sm ${i <= stage ? 'text-white' : 'text-t-secondary'}`}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* ── Form ── */
  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <div className="rounded-lg border border-dark-border bg-dark-surface p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold text-white">
          <Sparkles size={20} className="text-violet-400" />
          Set up your content plan
        </h2>
        <p className="mt-1 text-sm text-t-secondary">
          Answer four quick questions — the AI builds your brand profile from what it already knows about your business. You can fine-tune everything later.
        </p>

        {detected && (
          <div className="mt-4 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3.5 text-xs text-t-secondary">
            <span className="font-medium text-violet-300">The AI will learn from: </span>
            {[
              detected.organization?.name && `company profile (${detected.organization.name})`,
              faqCount > 0 && `${faqCount} FAQ answers`,
              (detected.services?.length ?? 0) > 0 && `${detected.services!.length} services`,
            ].filter(Boolean).join(' · ') || 'general setup'}
            {!hasKnowledge && (
              <p className="mt-1.5 text-amber-300">
                Little existing knowledge found — the AI will make more assumptions. Consider the advanced setup instead.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-t-secondary">Plan name</label>
              <input className={INPUT} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-t-secondary">Content language</label>
              <select className={INPUT} value={language} onChange={e => setLanguage(e.target.value)}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label} ({l.code})</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-t-secondary">What matters most right now?</label>
            <select className={INPUT} value={goal} onChange={e => setGoal(e.target.value)}>
              {GOAL_PRESETS.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-t-secondary">Where do you want to post?</label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map(p => {
                const on = platforms.includes(p)
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      on ? 'border-violet-500 bg-violet-600/20 text-white' : 'border-dark-border bg-dark-surface text-t-secondary hover:text-white'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PLATFORM_META[p].color }} />
                    {PLATFORM_META[p].label}
                    {on && <Check size={11} />}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-t-secondary">How much can you realistically publish?</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {INTENSITIES.map(it => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => setIntensity(it.key)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    intensity === it.key ? 'border-violet-500/60 bg-violet-500/10' : 'border-dark-border bg-dark-surface hover:border-dark-border2'
                  }`}
                >
                  <p className="text-sm font-medium text-white">{it.label}</p>
                  <p className="mt-0.5 text-xs text-t-secondary">{it.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => build.mutate()}
          disabled={platforms.length === 0}
          title={platforms.length === 0 ? 'Pick at least one platform' : undefined}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles size={15} /> Build my plan with AI
        </button>

        <button
          type="button"
          onClick={onAdvanced}
          className="mx-auto mt-4 flex items-center gap-1.5 text-xs text-t-secondary transition-colors hover:text-white"
        >
          <Settings2 size={12} /> Prefer full control? Use the advanced setup
        </button>
      </div>
    </div>
  )
}
