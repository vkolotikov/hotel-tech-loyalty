import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Monitor, TabletSmartphone, Palette, BarChart3, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'

/**
 * Survey platform panels for the ReviewFormBuilder (2026-07):
 *
 *  - SurveyDesignPanel — theme editor (gradient presets / custom colors,
 *    logo, welcome + thank-you screens, kiosk timings, layout toggle)
 *    with a live phone-shaped preview iframe of the real public page.
 *  - SurveyAnalyticsPanel — per-survey analytics from
 *    GET /v1/admin/reviews/forms/{id}/analytics.
 *
 * Both operate on the SAME config json the builder already saves, so
 * "Save design" is just the existing PUT /forms/{id} with the theme key.
 */

const PRESETS: { key: string; label: string; from: string; to: string }[] = [
  { key: 'ocean',    label: 'Ocean',    from: '#2563eb', to: '#38bdf8' },
  { key: 'aurora',   label: 'Aurora',   from: '#4f46e5', to: '#a855f7' },
  { key: 'sunset',   label: 'Sunset',   from: '#f97316', to: '#ec4899' },
  { key: 'forest',   label: 'Forest',   from: '#047857', to: '#84cc16' },
  { key: 'midnight', label: 'Midnight', from: '#0f172a', to: '#334155' },
]

const inputCls = 'w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40 placeholder:text-[#444]'

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">{icon}{title}</h3>
      {children}
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#888] mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export function SurveyDesignPanel({ config, setConfig, onSave, saving, previewUrl }: {
  config: Record<string, any>
  setConfig: (c: Record<string, any>) => void
  onSave: () => void
  saving: boolean
  previewUrl: string
}) {
  const theme = config.theme ?? {}
  const setTheme = (patch: Record<string, any>) => setConfig({ ...config, theme: { ...theme, ...patch } })
  const welcome = theme.welcome ?? {}
  const thanks = theme.thanks ?? {}
  const kiosk = theme.kiosk ?? {}
  // Bump to reload the preview iframe after a save.
  const [previewNonce, setPreviewNonce] = useState(0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
      <div className="space-y-4">
        <Section title="Layout" icon={<Monitor size={14} className="text-primary-400" />}>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'classic', title: 'Classic card', desc: 'All questions on one scrolling page. Best for email links.' },
              { key: 'stepper', title: 'Full-screen survey', desc: 'One question per screen, big touch targets. Best for kiosks + website popups.' },
            ].map(o => (
              <button key={o.key}
                onClick={() => setTheme({ layout: o.key })}
                className={`text-left p-4 rounded-xl border transition-colors ${(theme.layout ?? 'classic') === o.key ? 'border-primary-500 bg-primary-500/10' : 'border-dark-border bg-[#1a1a1a] hover:border-primary-500/40'}`}>
                <div className="text-sm font-semibold text-white mb-1">{o.title}</div>
                <div className="text-[11px] text-[#888] leading-relaxed">{o.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#666] mt-3">
            Kiosk devices always render full-screen mode regardless of this setting.
          </p>
        </Section>

        <Section title="Theme" icon={<Palette size={14} className="text-primary-400" />}>
          <div className="flex flex-wrap gap-3 mb-4">
            {PRESETS.map(p => (
              <button key={p.key}
                onClick={() => setTheme({ style: p.key })}
                className={`w-20 rounded-xl overflow-hidden border-2 transition-all ${(theme.style ?? 'ocean') === p.key ? 'border-primary-400 scale-105' : 'border-transparent opacity-80 hover:opacity-100'}`}>
                <div className="h-12" style={{ background: `linear-gradient(140deg, ${p.from}, ${p.to})` }} />
                <div className="text-[10px] font-semibold text-[#a0a0a0] py-1 bg-[#1a1a1a]">{p.label}</div>
              </button>
            ))}
            <button
              onClick={() => setTheme({ style: 'custom' })}
              className={`w-20 rounded-xl overflow-hidden border-2 transition-all ${theme.style === 'custom' ? 'border-primary-400 scale-105' : 'border-transparent opacity-80 hover:opacity-100'}`}>
              <div className="h-12" style={{ background: `linear-gradient(140deg, ${theme.bg_from ?? '#334155'}, ${theme.bg_to ?? '#64748b'})` }} />
              <div className="text-[10px] font-semibold text-[#a0a0a0] py-1 bg-[#1a1a1a]">Custom</div>
            </button>
          </div>

          {theme.style === 'custom' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { key: 'bg_from', label: 'Gradient start', def: '#334155' },
                { key: 'bg_to', label: 'Gradient end', def: '#64748b' },
                { key: 'button_bg', label: 'Buttons', def: '#ffffff' },
                { key: 'text_color', label: 'Text', def: '#ffffff' },
              ].map(c => (
                <L key={c.key} label={c.label}>
                  <input type="color" value={theme[c.key] ?? c.def}
                    onChange={e => setTheme({ [c.key]: e.target.value })}
                    className="w-full h-9 rounded-lg bg-[#1e1e1e] border border-dark-border cursor-pointer" />
                </L>
              ))}
            </div>
          )}

          <L label="Logo URL (shown at the top, optional)">
            <input value={theme.logo_url ?? ''} onChange={e => setTheme({ logo_url: e.target.value || undefined })}
              placeholder="https://…/logo.png" className={inputCls} />
          </L>
        </Section>

        <Section title="Welcome screen" icon={<TabletSmartphone size={14} className="text-primary-400" />}>
          <label className="flex items-center gap-2 text-sm text-[#a0a0a0] mb-3 cursor-pointer">
            <input type="checkbox" checked={welcome.enabled === true}
              onChange={e => setTheme({ welcome: { ...welcome, enabled: e.target.checked } })} />
            Show a welcome screen before the first question (kiosks always show it)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <L label="Title"><input value={welcome.title ?? ''} onChange={e => setTheme({ welcome: { ...welcome, title: e.target.value } })} placeholder="Please rate your experience today" className={inputCls} /></L>
            <L label="Subtitle"><input value={welcome.subtitle ?? ''} onChange={e => setTheme({ welcome: { ...welcome, subtitle: e.target.value } })} placeholder="It takes less than a minute" className={inputCls} /></L>
            <L label="Start button"><input value={welcome.button ?? ''} onChange={e => setTheme({ welcome: { ...welcome, button: e.target.value } })} placeholder="Start" className={inputCls} /></L>
          </div>
        </Section>

        <Section title="Thank-you screen & kiosk timing">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <L label="Thank-you title"><input value={thanks.title ?? ''} onChange={e => setTheme({ thanks: { ...thanks, title: e.target.value } })} placeholder="Thank you!" className={inputCls} /></L>
            <L label="Thank-you message"><input value={thanks.message ?? ''} onChange={e => setTheme({ thanks: { ...thanks, message: e.target.value } })} placeholder="Your feedback helps us improve." className={inputCls} /></L>
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <L label="Reset after thanks (sec)">
              <input type="number" min={3} max={60} value={kiosk.reset_seconds ?? 8}
                onChange={e => setTheme({ kiosk: { ...kiosk, reset_seconds: Number(e.target.value) || 8 } })} className={inputCls} />
            </L>
            <L label="Idle reset (sec)">
              <input type="number" min={15} max={600} value={kiosk.idle_reset_seconds ?? 60}
                onChange={e => setTheme({ kiosk: { ...kiosk, idle_reset_seconds: Number(e.target.value) || 60 } })} className={inputCls} />
            </L>
          </div>
          <p className="text-[11px] text-[#666] mt-2">
            Kiosk only: after the thank-you screen (or when a guest walks away mid-survey), the kiosk resets for the next guest.
          </p>
        </Section>

        <button onClick={() => { onSave(); setTimeout(() => setPreviewNonce(n => n + 1), 700) }} disabled={saving}
          className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-semibold">
          {saving ? 'Saving…' : 'Save design'}
        </button>
      </div>

      {/* Live preview — the REAL public page in a phone frame */}
      <div className="lg:sticky lg:top-6 self-start">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#888] mb-2 flex items-center justify-between">
          Live preview
          <button onClick={() => setPreviewNonce(n => n + 1)} className="flex items-center gap-1 text-[#888] hover:text-white normal-case font-medium">
            <RefreshCw size={11} /> Reload
          </button>
        </div>
        <div className="rounded-[28px] border-4 border-[#222] bg-black overflow-hidden shadow-2xl" style={{ aspectRatio: '9/16' }}>
          <iframe key={previewNonce} src={previewUrl} title="Survey preview" className="w-full h-full border-0" />
        </div>
        <p className="text-[10px] text-[#666] mt-2 leading-relaxed">
          Preview shows the saved version — click "Save design" to refresh it. Preview loads don't count in analytics.
        </p>
      </div>
    </div>
  )
}

/* ─── Analytics ──────────────────────────────────────────────────────── */

interface Analytics {
  days: number
  totals: { views: number; submissions: number; completion_rate: number | null; avg_rating: number | null; nps: number | null }
  series: { date: string; views: number; submissions: number }[]
  per_question: {
    id: number; label: string; kind: string; answered: number
    average?: number | null
    distribution?: Record<string, number>
    latest?: string[]
  }[]
  channels: Record<string, number>
  devices: { name: string; count: number }[]
}

export function SurveyAnalyticsPanel({ formId }: { formId: number }) {
  const [days, setDays] = useState(30)
  const { data, isLoading, isError, refetch } = useQuery<Analytics>({
    queryKey: ['review-form-analytics', formId, days],
    queryFn: () => api.get(`/v1/admin/reviews/forms/${formId}/analytics`, { params: { days } }).then(r => r.data),
  })

  const maxDay = useMemo(() => Math.max(1, ...(data?.series ?? []).map(s => Math.max(s.views, s.submissions))), [data])

  if (isLoading) return <div className="text-center text-[#636366] py-14 text-sm">Crunching numbers…</div>
  if (isError || !data) return (
    <div className="text-center py-14 text-sm text-red-300">
      Could not load analytics. <button onClick={() => refetch()} className="text-primary-400 font-semibold ml-1">Retry</button>
    </div>
  )

  const t = data.totals
  const kpi = (label: string, value: string, sub?: string) => (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="text-[#a0a0a0] text-[10px] uppercase tracking-wider mb-1.5">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      {sub && <div className="text-[10px] text-[#666] mt-0.5">{sub}</div>}
    </div>
  )

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2"><BarChart3 size={14} className="text-primary-400" /> Last {data.days} days</h3>
        <div className="flex gap-1 bg-[#1e1e1e] p-1 rounded-lg">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold ${days === d ? 'bg-primary-500 text-white' : 'text-[#a0a0a0] hover:text-white'}`}>{d}d</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpi('Views', String(t.views))}
        {kpi('Responses', String(t.submissions))}
        {kpi('Completion', t.completion_rate !== null ? `${t.completion_rate}%` : '—', 'responses / views')}
        {kpi('Avg rating', t.avg_rating !== null ? `${t.avg_rating}★` : '—')}
        {kpi('NPS', t.nps !== null ? String(t.nps) : '—', 'promoters − detractors')}
      </div>

      {/* Trend */}
      <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#888] mb-3">Responses over time</div>
        {data.series.length === 0 ? (
          <p className="text-xs text-[#636366] py-4 text-center">No activity in this window yet.</p>
        ) : (
          <div className="flex items-end gap-[3px] h-24">
            {data.series.map(s => (
              <div key={s.date} className="flex-1 flex flex-col justify-end gap-[2px]" title={`${s.date} — ${s.views} views, ${s.submissions} responses`}>
                <div className="w-full rounded-sm bg-primary-500/30" style={{ height: `${(s.views / maxDay) * 100}%`, minHeight: s.views ? 2 : 0 }} />
                <div className="w-full rounded-sm bg-primary-400" style={{ height: `${(s.submissions / maxDay) * 100}%`, minHeight: s.submissions ? 2 : 0 }} />
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-4 mt-2 text-[10px] text-[#666]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary-500/30 inline-block" /> Views</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary-400 inline-block" /> Responses</span>
        </div>
      </div>

      {/* Channel + device split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#888] mb-3">By channel</div>
          {Object.keys(data.channels).length === 0
            ? <p className="text-xs text-[#636366]">No responses yet.</p>
            : Object.entries(data.channels).map(([ch, n]) => (
              <div key={ch} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-[#a0a0a0] capitalize">{ch}</span><span className="text-white font-semibold">{n}</span>
              </div>
            ))}
        </div>
        <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#888] mb-3">By kiosk device</div>
          {data.devices.length === 0
            ? <p className="text-xs text-[#636366]">No kiosk responses yet.</p>
            : data.devices.map(d => (
              <div key={d.name} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-[#a0a0a0]">{d.name}</span><span className="text-white font-semibold">{d.count}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Per-question */}
      {data.per_question.map(q => {
        const total = Object.values(q.distribution ?? {}).reduce((a, b) => a + b, 0)
        return (
          <div key={q.id} className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="text-sm font-semibold text-white truncate">{q.label}</div>
              <div className="text-[10px] text-[#666] whitespace-nowrap">
                {q.answered} answered{q.average != null && <span className="ml-2 text-primary-300 font-bold">avg {q.average}</span>}
              </div>
            </div>
            {q.distribution && total > 0 && (
              <div className="space-y-1.5">
                {Object.entries(q.distribution).map(([k, n]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-24 truncate text-[#a0a0a0]" title={k}>{k}</span>
                    <div className="flex-1 h-4 bg-white/[0.04] rounded overflow-hidden">
                      <div className="h-full bg-primary-500/70 rounded" style={{ width: `${(n / total) * 100}%` }} />
                    </div>
                    <span className="w-10 text-right text-white font-semibold tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            )}
            {q.latest && (
              q.latest.length === 0
                ? <p className="text-xs text-[#636366]">No text answers yet.</p>
                : <ul className="space-y-1.5">{q.latest.map((txt, i) => (
                    <li key={i} className="text-xs text-[#c0c0c0] bg-white/[0.03] border border-dark-border rounded-lg px-3 py-2">“{txt}”</li>
                  ))}</ul>
            )}
            {q.distribution && total === 0 && !q.latest && (
              <p className="text-xs text-[#636366]">No answers yet.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
