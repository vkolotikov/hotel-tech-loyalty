import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Archive, Check, ChevronDown, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import type { PlannerProfile, Strategy, StrategyOutput } from './lib'
import { cp, errMsg, ENGAGEMENT_GOALS, MIX_CATEGORIES, PLATFORM_META, POST_TYPES, WEEKDAY_ROLE_META, WEEKDAYS } from './lib'

const STAGES = [
  'Analyzing brand DNA…',
  'Mapping audience psychology…',
  'Defining content pillars…',
  'Designing weekly rhythm…',
  'Writing platform playbooks…',
  'Scoring risks & opportunities…',
]

const STRATEGY_STATUS: Record<string, { label: string; cls: string }> = {
  active:     { label: 'Active',     cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  superseded: { label: 'Superseded', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  archived:   { label: 'Archived',   cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
}

/* ─── Small presentational helpers ───────────────────────────────── */

function Section({ title, children, collapsible = false }: { title: string; children: ReactNode; collapsible?: boolean }) {
  // Deep-detail sections start collapsed so the page reads as a summary
  // first; a click expands the expert-level detail.
  const [open, setOpen] = useState(!collapsible)

  if (!collapsible) {
    return (
      <section className="rounded-lg border border-dark-border bg-dark-surface p-4">
        <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
        {children}
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-dark-border bg-dark-surface">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="flex items-center gap-1.5 text-xs text-t-secondary">
          {open ? 'Hide' : 'Show'}
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  )
}

function Chips({ items }: { items?: string[] | null }) {
  if (!items?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span key={i} className="rounded-full border border-dark-border bg-dark-surface2 px-2 py-0.5 text-[11px] text-gray-300">
          {it}
        </span>
      ))}
    </div>
  )
}

function ChipGroup({ label, items }: { label: string; items?: string[] | null }) {
  if (!items?.length) return null
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-t-secondary mb-1">{label}</p>
      <Chips items={items} />
    </div>
  )
}

function PlatformDots({ platforms }: { platforms?: string[] | null }) {
  if (!platforms?.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {platforms.map(pl => {
        const meta = PLATFORM_META[pl]
        return (
          <span key={pl} className="inline-flex items-center gap-1 text-[10px] text-t-secondary" title={meta?.label ?? pl}>
            <span className="w-2 h-2 rounded-full" style={{ background: meta?.color ?? '#9ca3af' }} />
            {meta?.label ?? pl}
          </span>
        )
      })}
    </div>
  )
}

function ListCard({ title, items, tone = 'neutral', numbered = false }: {
  title: string
  items: string[]
  tone?: 'red' | 'green' | 'amber' | 'neutral'
  numbered?: boolean
}) {
  const tones: Record<string, { border: string; title: string; text: string }> = {
    red:     { border: 'border-red-500/30',     title: 'text-red-300',     text: 'text-red-100/80' },
    green:   { border: 'border-emerald-500/30', title: 'text-emerald-300', text: 'text-emerald-100/80' },
    amber:   { border: 'border-amber-500/30',   title: 'text-amber-300',   text: 'text-amber-100/80' },
    neutral: { border: 'border-dark-border',    title: 'text-white',       text: 'text-gray-300' },
  }
  const t = tones[tone] ?? tones.neutral
  const Tag = numbered ? ('ol' as const) : ('ul' as const)
  return (
    <div className={`rounded-lg border bg-dark-surface p-4 ${t.border}`}>
      <h4 className={`text-sm font-semibold mb-2 ${t.title}`}>{title}</h4>
      <Tag className={`${numbered ? 'list-decimal' : 'list-disc'} list-inside space-y-1 text-xs ${t.text}`}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </Tag>
    </div>
  )
}

/* ─── Main view ──────────────────────────────────────────────────── */

export function StrategyView({ profile }: { profile: PlannerProfile }) {
  const queryClient = useQueryClient()
  const [instructions, setInstructions] = useState('')
  const [regenOpen, setRegenOpen] = useState(false)
  const [regenInstructions, setRegenInstructions] = useState('')
  const [openPlatform, setOpenPlatform] = useState<string | null>(null)
  const [stage, setStage] = useState(0)

  const { data: resp, isLoading } = useQuery({
    queryKey: ['cp-strategies', profile.id],
    queryFn: () => cp.listStrategies(profile.id),
  })

  const generate = useMutation({
    mutationFn: (instr: string) => cp.generateStrategy(profile.id, instr.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cp-strategies'] })
      toast.success('Strategy generated')
      setRegenOpen(false)
      setRegenInstructions('')
      setInstructions('')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const archive = useMutation({
    mutationFn: (id: number) => cp.archiveStrategy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cp-strategies'] })
      toast.success('Strategy archived')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const pending = generate.isPending
  useEffect(() => {
    if (!pending) {
      setStage(0)
      return
    }
    const id = window.setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), 10_000)
    return () => window.clearInterval(id)
  }, [pending])

  const strategies: Strategy[] = resp?.data ?? []
  const sorted = [...strategies].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const current = sorted.find(s => s.status === 'active') ?? sorted[0] ?? null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (pending) {
    return (
      <div className="max-w-lg mx-auto rounded-lg border border-dark-border bg-dark-surface p-6">
        <div className="flex items-center gap-2 mb-2">
          <Loader2 size={18} className="animate-spin text-violet-400" />
          <h3 className="text-sm font-semibold text-white">Generating your strategy…</h3>
        </div>
        <p className="text-xs text-t-secondary mb-5">This usually takes 1–3 minutes. Keep this tab open.</p>
        <ul className="space-y-3">
          {STAGES.map((s, i) => (
            <li key={s} className="flex items-center gap-2.5 text-sm">
              {i < stage ? (
                <Check size={14} className="text-emerald-400 shrink-0" />
              ) : i === stage ? (
                <span className="relative w-3.5 h-3.5 flex items-center justify-center shrink-0">
                  <span className="absolute w-2.5 h-2.5 rounded-full bg-violet-500 animate-ping" />
                  <span className="w-2 h-2 rounded-full bg-violet-400" />
                </span>
              ) : (
                <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-dark-surface4" />
                </span>
              )}
              <span className={i <= stage ? 'text-white' : 'text-t-secondary'}>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="max-w-2xl mx-auto rounded-lg border border-dark-border bg-dark-surface p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-violet-600/20 flex items-center justify-center mx-auto">
          <Sparkles size={26} className="text-violet-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Generate your content strategy</h2>
          <p className="text-sm text-t-secondary mt-2 max-w-lg mx-auto">
            The AI strategist combines your brand DNA, audience segments and FAQ / company knowledge into a full
            content strategy: pillars, weekly rhythm, platform playbooks, campaign ideas and example posts.
          </p>
        </div>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={3}
          placeholder="Optional instructions — e.g. focus on LinkedIn, product launch in September…"
          className="w-full rounded-lg border border-dark-border bg-dark-surface2 px-3 py-2 text-sm text-white placeholder-t-secondary outline-none focus:border-violet-500 transition-colors resize-none text-left"
        />
        <button
          onClick={() => generate.mutate(instructions)}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-700 px-5 py-2.5 text-sm font-medium text-white transition-colors"
        >
          <Sparkles size={15} /> Generate strategy
        </button>
        <p className="text-[11px] text-t-secondary">Takes 1–3 minutes.</p>
      </div>
    )
  }

  const out: StrategyOutput = current.ai_output ?? {}
  const badge = STRATEGY_STATUS[current.status] ?? STRATEGY_STATUS.archived
  const pn = out.positioning_narrative
  const hasPositioning = !!pn && (!!pn.old_way || !!pn.new_way || !!pn.beliefs?.length || !!pn.key_messages?.length)
  const mixEntries = Object.entries(out.content_mix ?? {})
  const platformEntries = Object.entries(out.platform_strategy ?? {})
  const hasRhythm = Object.keys(out.weekly_rhythm ?? {}).length > 0
  const es = out.engagement_strategy
  const cs = out.conversion_strategy
  const hasEngagement = !!es && (!!es.primary_goals?.length || !!es.mechanics?.length)
  const hasConversion = !!cs && (!!cs.approach || !!cs.soft_cta_examples?.length)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-dark-border bg-dark-surface p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[220px]">
            <h2 className="text-lg font-semibold text-white">{out.title || current.title}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
              <span className="text-xs text-t-secondary">Created {new Date(current.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setRegenOpen(o => !o)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-sm font-medium text-white transition-colors"
            >
              <RefreshCw size={13} /> Regenerate
            </button>
            {regenOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-dark-border bg-dark-surface2 p-4 shadow-xl z-20">
                <p className="flex items-start gap-1.5 text-xs text-amber-300/90 mb-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  Regenerating supersedes the current strategy and replaces its pillars.
                </p>
                <textarea
                  value={regenInstructions}
                  onChange={e => setRegenInstructions(e.target.value)}
                  rows={3}
                  placeholder="Optional instructions for the new strategy…"
                  className="w-full rounded-lg border border-dark-border bg-dark-surface3 px-3 py-2 text-xs text-white placeholder-t-secondary outline-none focus:border-violet-500 transition-colors resize-none"
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => setRegenOpen(false)}
                    className="rounded-lg border border-dark-border px-3 py-1.5 text-xs text-gray-300 hover:border-dark-border2 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => generate.mutate(regenInstructions)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                  >
                    <Sparkles size={12} /> Regenerate now
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => {
              if (window.confirm('Archive this strategy? You can generate a new one at any time.')) {
                archive.mutate(current.id)
              }
            }}
            disabled={archive.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border bg-dark-surface2 hover:border-dark-border2 px-3 py-1.5 text-sm text-gray-300 transition-colors disabled:opacity-50"
          >
            <Archive size={13} /> Archive
          </button>
        </div>
      </div>

      {/* 1. Brand summary + assumptions */}
      {(out.brand_summary || !!out.assumptions?.length) && (
        <Section title="Brand summary">
          {out.brand_summary && <p className="text-sm text-gray-300 leading-relaxed">{out.brand_summary}</p>}
          {!!out.assumptions?.length && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 mb-1.5">
                <AlertTriangle size={12} /> Assumptions made by the AI
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-100/80">
                {out.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
        </Section>
      )}

      {/* 2. Positioning */}
      {hasPositioning && (
        <Section title="Positioning">
          <div className="grid md:grid-cols-2 gap-3">
            {pn?.old_way && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-xs font-semibold text-red-300 mb-1.5">✗ Old way</p>
                <p className="text-sm text-gray-200">{pn.old_way}</p>
              </div>
            )}
            {pn?.new_way && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-xs font-semibold text-emerald-300 mb-1.5">✓ New way</p>
                <p className="text-sm text-gray-200">{pn.new_way}</p>
              </div>
            )}
          </div>
          <div className="mt-3 space-y-3">
            <ChipGroup label="Beliefs" items={pn?.beliefs} />
            {!!pn?.key_messages?.length && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-t-secondary mb-1">Key messages</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-300">
                  {pn.key_messages.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 3. Audience map */}
      {!!out.audience_map?.length && (
        <Section title="Audience map" collapsible>
          <div className="grid md:grid-cols-2 gap-3">
            {out.audience_map.map((a, i) => (
              <div key={i} className="rounded-lg border border-dark-border bg-dark-surface2 p-3 space-y-2.5">
                <p className="text-sm font-semibold text-white">{a.name}</p>
                <ChipGroup label="Pains" items={a.pains} />
                <ChipGroup label="Desires" items={a.desires} />
                <ChipGroup label="Objections" items={a.objections} />
                <ChipGroup label="Emotional triggers" items={a.emotional_triggers} />
                {!!a.content_they_engage_with?.length && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-t-secondary mb-1">Content they engage with</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-300">
                      {a.content_they_engage_with.map((c, j) => <li key={j}>{c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 4. Content pillars */}
      {!!out.content_pillars?.length && (
        <Section title="Content pillars">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {out.content_pillars.map((p, i) => {
              const w = Math.max(0, Math.min(100, p.frequency_weight ?? 0))
              return (
                <div key={i} className="rounded-lg border border-dark-border bg-dark-surface2 p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                    <span className="text-xs font-medium text-violet-300 shrink-0">{w}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-dark-surface3">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400" style={{ width: `${w}%` }} />
                  </div>
                  {p.purpose && <p className="text-xs text-t-secondary">{p.purpose}</p>}
                  <Chips items={p.example_topics} />
                  <PlatformDots platforms={p.recommended_platforms} />
                  {!!p.cta_examples?.length && (
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-gray-400">
                      {p.cta_examples.map((c, j) => <li key={j}>{c}</li>)}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* 5. Content mix */}
      {mixEntries.length > 0 && (
        <Section title="Content mix">
          <div className="space-y-2">
            {mixEntries.map(([k, v]) => {
              const w = Math.max(0, Math.min(100, Number(v) || 0))
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-xs text-t-secondary truncate">{MIX_CATEGORIES[k] ?? k}</span>
                  <div className="flex-1 h-2 rounded-full bg-dark-surface3">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400" style={{ width: `${w}%` }} />
                  </div>
                  <span className="w-9 text-right text-xs text-white shrink-0">{w}%</span>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* 6. Weekly rhythm */}
      {hasRhythm && (
        <Section title="Weekly rhythm">
          <div className="overflow-x-auto">
            <div className="grid grid-cols-7 gap-2 min-w-[840px]">
              {WEEKDAYS.map(day => {
                const r = out.weekly_rhythm?.[day]
                return (
                  <div key={day} className="rounded-lg border border-dark-border bg-dark-surface2 p-2.5 space-y-1.5">
                    <p className="text-[11px] font-semibold text-white capitalize">{day.slice(0, 3)}</p>
                    <p className="text-[11px] text-violet-300">
                      {r?.role ? (WEEKDAY_ROLE_META[r.role]?.label ?? r.role) : '—'}
                    </p>
                    {r?.description && <p className="text-[10px] text-t-secondary">{r.description}</p>}
                    {!!r?.platforms?.length && (
                      <div className="flex flex-wrap gap-1">
                        {r.platforms.map(pl => (
                          <span
                            key={pl}
                            className="w-2 h-2 rounded-full"
                            title={PLATFORM_META[pl]?.label ?? pl}
                            style={{ background: PLATFORM_META[pl]?.color ?? '#9ca3af' }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </Section>
      )}

      {/* 7. Platform strategy */}
      {platformEntries.length > 0 && (
        <Section title="Platform strategy" collapsible>
          <div className="space-y-2">
            {platformEntries.map(([platform, ps]) => {
              const meta = PLATFORM_META[platform]
              const open = openPlatform === platform
              return (
                <div key={platform} className="rounded-lg border border-dark-border overflow-hidden">
                  <button
                    onClick={() => setOpenPlatform(open ? null : platform)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 bg-dark-surface2 text-left hover:bg-dark-surface3 transition-colors"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta?.color ?? '#9ca3af' }} />
                    <span className="flex-1 text-sm font-medium text-white">{meta?.label ?? platform}</span>
                    {ps.frequency && <span className="text-xs text-t-secondary">{ps.frequency}</span>}
                    <ChevronDown size={14} className={`text-t-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div className="px-3 py-3 space-y-2.5">
                      {ps.role && (
                        <p className="text-xs text-gray-300"><span className="text-t-secondary">Role:</span> {ps.role}</p>
                      )}
                      {ps.tone && (
                        <p className="text-xs text-gray-300"><span className="text-t-secondary">Tone:</span> {ps.tone}</p>
                      )}
                      <ChipGroup label="Formats" items={ps.formats} />
                      <ChipGroup
                        label="Post types"
                        items={ps.post_types?.map(t => POST_TYPES[t] ?? t)}
                      />
                      {ps.cta_style && (
                        <p className="text-xs text-gray-300"><span className="text-t-secondary">CTA style:</span> {ps.cta_style}</p>
                      )}
                      {!!ps.engagement_mechanics?.length && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-t-secondary mb-1">Engagement mechanics</p>
                          <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-300">
                            {ps.engagement_mechanics.map((m, j) => <li key={j}>{m}</li>)}
                          </ul>
                        </div>
                      )}
                      {ps.visual_style && (
                        <p className="text-xs text-gray-300"><span className="text-t-secondary">Visual style:</span> {ps.visual_style}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* 8. Engagement & conversion */}
      {(hasEngagement || hasConversion) && (
        <div className="grid md:grid-cols-2 gap-4">
          {hasEngagement && (
            <Section title="Engagement strategy" collapsible>
              <div className="space-y-3">
                <ChipGroup
                  label="Primary goals"
                  items={es?.primary_goals?.map(g => ENGAGEMENT_GOALS[g] ?? g)}
                />
                {!!es?.mechanics?.length && (
                  <div className="space-y-1.5">
                    {es.mechanics.map((m, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 rounded-full bg-violet-600/20 text-violet-300 px-2 py-0.5 font-medium">
                          {ENGAGEMENT_GOALS[m.goal ?? ''] ?? m.goal}
                        </span>
                        <span className="text-gray-300">{m.tactic}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}
          {hasConversion && (
            <Section title="Conversion strategy" collapsible>
              <div className="space-y-3">
                {cs?.approach && <p className="text-sm text-gray-300">{cs.approach}</p>}
                {!!cs?.soft_cta_examples?.length && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-t-secondary mb-1">Soft CTA examples</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-300">
                      {cs.soft_cta_examples.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* 9. Visual direction */}
      {out.visual_direction && (
        <Section title="Visual direction" collapsible>
          <p className="text-sm text-gray-300 leading-relaxed">{out.visual_direction}</p>
        </Section>
      )}

      {/* 10. Monthly themes & campaign ideas */}
      {(!!out.monthly_themes?.length || !!out.campaign_ideas?.length) && (
        <Section title="Monthly themes & campaigns" collapsible>
          <div className="space-y-3">
            <Chips items={out.monthly_themes} />
            {!!out.campaign_ideas?.length && (
              <div className="grid sm:grid-cols-2 gap-3">
                {out.campaign_ideas.map((c, i) => (
                  <div key={i} className="rounded-lg border border-dark-border bg-dark-surface2 p-3">
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    {c.goal && <p className="text-[11px] text-violet-300 mt-0.5">{c.goal}</p>}
                    {c.description && <p className="text-xs text-t-secondary mt-1.5">{c.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* 11. Example posts */}
      {!!out.example_posts?.length && (
        <Section title="Example posts" collapsible>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {out.example_posts.map((p, i) => {
              const meta = p.platform ? PLATFORM_META[p.platform] : undefined
              return (
                <div key={i} className="rounded-lg border border-dark-border bg-dark-surface2 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                      style={{ background: meta?.color ?? '#6b7280' }}
                    >
                      {meta?.label ?? p.platform ?? 'Post'}
                    </span>
                    {p.post_type && (
                      <span className="text-[10px] text-t-secondary">{POST_TYPES[p.post_type] ?? p.post_type}</span>
                    )}
                  </div>
                  {p.hook && (
                    <p className="border-l-2 border-violet-500 pl-2 text-sm italic text-violet-200">“{p.hook}”</p>
                  )}
                  {p.summary && <p className="text-xs text-t-secondary">{p.summary}</p>}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* 12. Risks / opportunities / missing info / next actions */}
      {(!!out.risks?.length || !!out.opportunities?.length || !!out.missing_information?.length || !!out.next_actions?.length) && (
        <div className="grid md:grid-cols-2 gap-4">
          {!!out.risks?.length && <ListCard title="Risks" items={out.risks} tone="red" />}
          {!!out.opportunities?.length && <ListCard title="Opportunities" items={out.opportunities} tone="green" />}
          {!!out.missing_information?.length && <ListCard title="Missing information" items={out.missing_information} tone="amber" />}
          {!!out.next_actions?.length && <ListCard title="Next actions" items={out.next_actions} numbered />}
        </div>
      )}
    </div>
  )
}
