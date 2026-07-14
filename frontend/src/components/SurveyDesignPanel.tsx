import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Monitor, TabletSmartphone, Palette, BarChart3, RefreshCw, Code2, Copy, Send } from 'lucide-react'
import toast from 'react-hot-toast'
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

/** iOS-style switch — replaces bare checkboxes across the panel. */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-left group">
      <span className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-primary-500' : 'bg-white/[0.09] border border-dark-border'}`}>
        <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[20px]' : 'translate-x-[2px]'}`} />
      </span>
      <span className="text-sm text-[#c8c8cc] group-hover:text-white transition-colors">{label}</span>
    </button>
  )
}

/** Color swatch + hex field combo. */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <L label={label}>
      <div className="flex items-center gap-2">
        <label className="relative w-9 h-9 rounded-lg overflow-hidden border border-dark-border cursor-pointer flex-shrink-0"
          style={{ background: value }}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <input value={value} onChange={e => onChange(e.target.value)} spellCheck={false}
          className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-2.5 py-2 text-xs font-mono text-white" />
      </div>
    </L>
  )
}

/** Slider + live value bubble for timing settings. */
function RangeField({ label, value, onChange, min, max, unit }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; unit: string
}) {
  return (
    <L label={label}>
      <div className="flex items-center gap-3">
        <input type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 accent-primary-500 cursor-pointer" />
        <span className="w-14 text-right text-sm font-semibold text-white tabular-nums">{value}{unit}</span>
      </div>
    </L>
  )
}

export function SurveyDesignPanel({ config, setConfig, onSave, saving, previewUrl, embed }: {
  config: Record<string, any>
  setConfig: (c: Record<string, any>) => void
  onSave: () => void
  saving: boolean
  previewUrl: string
  embed: { formId: number; embedKey: string; origin: string }
}) {
  const theme = config.theme ?? {}
  const setTheme = (patch: Record<string, any>) => setConfig({ ...config, theme: { ...theme, ...patch } })
  const welcome = theme.welcome ?? {}
  const thanks = theme.thanks ?? {}
  const kiosk = theme.kiosk ?? {}
  // Bump to reload the preview iframe after a save.
  const [previewNonce, setPreviewNonce] = useState(0)
  const frameRef = useRef<HTMLIFrameElement>(null)

  // LIVE preview: push the draft config into the iframe (debounced) so
  // every tweak renders instantly — no save round-trip. The renderer
  // only honours this in ?preview=1 mode.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        frameRef.current?.contentWindow?.postMessage(
          { source: 'hotel-tech-review-admin', config },
          '*',
        )
      } catch { /* iframe not ready yet — the reload covers it */ }
    }, 250)
    return () => clearTimeout(t)
  }, [config, previewNonce])

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
                <ColorField key={c.key} label={c.label} value={theme[c.key] ?? c.def}
                  onChange={v => setTheme({ [c.key]: v })} />
              ))}
            </div>
          )}

          <L label="Logo URL (shown at the top, optional)">
            <input value={theme.logo_url ?? ''} onChange={e => setTheme({ logo_url: e.target.value || undefined })}
              placeholder="https://…/logo.png" className={inputCls} />
          </L>
        </Section>

        <Section title="Welcome screen" icon={<TabletSmartphone size={14} className="text-primary-400" />}>
          <div className="mb-4">
            <Switch checked={welcome.enabled === true}
              onChange={v => setTheme({ welcome: { ...welcome, enabled: v } })}
              label="Show a welcome screen before the first question (kiosks always show it)" />
          </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 max-w-xl">
            <RangeField label="Reset after thanks" min={3} max={60} unit="s"
              value={kiosk.reset_seconds ?? 8}
              onChange={v => setTheme({ kiosk: { ...kiosk, reset_seconds: v } })} />
            <RangeField label="Idle reset (guest walked away)" min={15} max={300} unit="s"
              value={kiosk.idle_reset_seconds ?? 60}
              onChange={v => setTheme({ kiosk: { ...kiosk, idle_reset_seconds: v } })} />
          </div>
          <p className="text-[11px] text-[#666] mt-2">
            Kiosk only: after the thank-you screen (or when a guest walks away mid-survey), the kiosk resets for the next guest.
          </p>
        </Section>


        <Section title="Post-stay automation" icon={<Send size={14} className="text-primary-400" />}>
          <Switch checked={config.auto_send_post_stay === true}
            onChange={v => setConfig({ ...config, auto_send_post_stay: v })}
            label="Automatically email this survey to guests after checkout" />
          {config.auto_send_post_stay === true && (
            <div className="mt-4 max-w-xs">
              <RangeField label="Days after checkout" min={1} max={14} unit="d"
                value={config.auto_send_delay_days ?? 1}
                onChange={v => setConfig({ ...config, auto_send_delay_days: v })} />
            </div>
          )}
          <p className="text-[11px] text-[#666] mt-3 leading-relaxed">
            Runs daily at 09:00 — invites every booking-engine guest (with an email) who checked out that many
            days earlier. Each booking is invited once. Enable this on ONE survey only, or guests get multiple emails.
          </p>
        </Section>

        <Section title="Website widget & embed" icon={<Code2 size={14} className="text-primary-400" />}>
          <WidgetSnippet embed={embed} />
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
          <iframe ref={frameRef} key={previewNonce} src={previewUrl} title="Survey preview" className="w-full h-full border-0"
            onLoad={() => {
              try { frameRef.current?.contentWindow?.postMessage({ source: 'hotel-tech-review-admin', config }, '*') } catch {}
            }} />
        </div>
        <p className="text-[10px] text-[#666] mt-2 leading-relaxed">
          Updates live as you tweak the design. Question changes need a save + Reload. Preview loads don't count in analytics.
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

/* ─── Website widget snippet generator ──────────────────────────────── */

function WidgetSnippet({ embed }: { embed: { formId: number; embedKey: string; origin: string } }) {
  const [mode, setMode] = useState<'button' | 'popup' | 'slideup'>('button')
  const [position, setPosition] = useState<'right' | 'left'>('right')
  const [label, setLabel] = useState('Feedback')
  const [color, setColor] = useState('#2563eb')
  const [delay, setDelay] = useState(5)

  const snippet = useMemo(() => {
    const attrs = [
      `src="${embed.origin}/widget/hotel-survey.js"`,
      `data-survey="${embed.formId}"`,
      `data-key="${embed.embedKey}"`,
      `data-mode="${mode}"`,
      mode === 'button' ? `data-position="${position}" data-label="${label}" data-color="${color}"` : `data-delay="${delay}"`,
      'async',
    ]
    return `<script ${attrs.join(' ')}></` + 'script>'
  }, [embed, mode, position, label, color, delay])

  const iframeSnippet = `<iframe src="${embed.origin}/review/${embed.formId}?key=${embed.embedKey}" style="width:100%;min-height:640px;border:0;border-radius:16px" title="Feedback survey"></iframe>`

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {([
          { key: 'button',  title: 'Floating button', desc: 'Side tab, always available' },
          { key: 'popup',   title: 'Popup',           desc: 'Centered, opens after a delay' },
          { key: 'slideup', title: 'Slide-up',        desc: 'Corner card, opens after a delay' },
        ] as const).map(o => (
          <button key={o.key} onClick={() => setMode(o.key)}
            className={`text-left p-3 rounded-xl border transition-colors ${mode === o.key ? 'border-primary-500 bg-primary-500/10' : 'border-dark-border bg-[#1a1a1a] hover:border-primary-500/40'}`}>
            <div className="text-xs font-semibold text-white">{o.title}</div>
            <div className="text-[10px] text-[#888] mt-0.5 leading-snug">{o.desc}</div>
          </button>
        ))}
      </div>

      {mode === 'button' ? (
        <div className="grid grid-cols-3 gap-3">
          <L label="Button label">
            <input value={label} onChange={e => setLabel(e.target.value)} className={inputCls} />
          </L>
          <ColorField label="Color" value={color} onChange={setColor} />
          <L label="Side">
            <select value={position} onChange={e => setPosition(e.target.value as any)} className={inputCls}>
              <option value="right">Right</option><option value="left">Left</option>
            </select>
          </L>
        </div>
      ) : (
        <div className="max-w-xs">
          <RangeField label="Open after" min={0} max={60} unit="s" value={delay} onChange={setDelay} />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#888]">Paste before &lt;/body&gt;</span>
          <button onClick={() => { navigator.clipboard.writeText(snippet); toast.success('Snippet copied') }}
            className="flex items-center gap-1 text-[11px] text-primary-400 hover:text-primary-300 font-semibold">
            <Copy size={11} /> Copy
          </button>
        </div>
        <pre className="bg-[#111] border border-dark-border rounded-lg p-3 text-[10.5px] text-[#9ae6b4] overflow-x-auto whitespace-pre-wrap break-all">{snippet}</pre>
        <p className="text-[10px] text-[#666] mt-2 leading-relaxed">
          Auto-open modes remember each visitor: after they submit, the survey stays away for 90 days;
          after they dismiss it, 7 days. The floating button is always available until they submit.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#888]">Or embed inline (iframe)</span>
          <button onClick={() => { navigator.clipboard.writeText(iframeSnippet); toast.success('Iframe snippet copied') }}
            className="flex items-center gap-1 text-[11px] text-primary-400 hover:text-primary-300 font-semibold">
            <Copy size={11} /> Copy
          </button>
        </div>
        <pre className="bg-[#111] border border-dark-border rounded-lg p-3 text-[10.5px] text-[#93c5fd] overflow-x-auto whitespace-pre-wrap break-all">{iframeSnippet}</pre>
      </div>
    </div>
  )
}
