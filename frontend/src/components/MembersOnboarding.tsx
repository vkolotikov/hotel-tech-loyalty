import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Building2, Sparkles, Utensils, Dumbbell, Star, Crown,
  ArrowRight, ArrowLeft, X, Zap, Check, Database, FileText, AlertCircle,
} from 'lucide-react'

/**
 * Setup wizard shown on first visit to /members. Picks a membership
 * preset (tier ladder + starter benefits) tuned to the business
 * vertical so a non-expert can stand up a working loyalty program
 * with one click instead of authoring 5 tiers + N benefits by hand.
 *
 * Three steps:
 *   1. Pick a preset (6 cards)
 *   2. Want sample members to explore? (yes/no)
 *   3. Review + apply
 *
 * Skip path: dismisses the wizard without applying anything.
 * Marker stored in crm_settings so Members.tsx knows to not show
 * it again until the admin re-opens it from Settings.
 */

interface PresetMeta {
  key: string
  label: string
  description: string
  icon: string
  tier_count: number
  benefit_count: number
  tier_names: string[]
  welcome_bonus: number
  is_current: boolean
}

interface PresetsResponse {
  presets: PresetMeta[]
  current: string | null
  onboarding_completed_at: string | null
}

const ICON_MAP: Record<string, any> = {
  'building-2': Building2,
  'sparkles':   Sparkles,
  'utensils':   Utensils,
  'dumbbell':   Dumbbell,
  'star':       Star,
}

interface Props {
  onComplete: () => void
}

export function MembersOnboarding({ onComplete }: Props) {
  const qc = useQueryClient()
  const [step, setStep] = useState(1)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [withSample, setWithSample] = useState(false)

  const { data, isLoading } = useQuery<PresetsResponse>({
    queryKey: ['loyalty-presets'],
    queryFn: () => api.get('/v1/admin/loyalty-presets').then(r => r.data),
  })

  const apply = useMutation({
    mutationFn: () => api.post('/v1/admin/loyalty-presets/apply', {
      preset: selectedKey,
      with_sample_data: withSample,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['crm-settings'] })
      qc.invalidateQueries({ queryKey: ['loyalty-tiers'] })
      qc.invalidateQueries({ queryKey: ['loyalty-members'] })
      qc.invalidateQueries({ queryKey: ['loyalty-presets'] })
      toast.success(res.data?.message ?? 'Membership configured')
      onComplete()
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Could not apply preset'),
  })

  const skip = useMutation({
    mutationFn: () => api.post('/v1/admin/loyalty-presets/skip'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-settings'] })
      toast.success('Skipped — set up tiers manually anytime')
      onComplete()
    },
  })

  if (isLoading || !data) {
    return <div className="flex items-center justify-center p-12 text-sm text-gray-500">Loading presets…</div>
  }

  const picked = selectedKey ? data.presets.find(p => p.key === selectedKey) : null
  const Icon = picked ? (ICON_MAP[picked.icon] ?? Star) : Star

  return (
    <div className="bg-dark-bg min-h-[calc(100vh-80px)] flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
              <Crown className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Set up your membership program</h1>
              <p className="text-xs text-gray-500">Pick a preset, customise later from Settings.</p>
            </div>
          </div>
          <button
            onClick={() => skip.mutate()}
            disabled={skip.isPending}
            className="text-xs text-gray-500 hover:text-white flex items-center gap-1.5">
            Skip for now <X size={12} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s}
              className={'h-1.5 rounded-full transition-all ' +
                (s < step ? 'w-8 bg-emerald-500' : s === step ? 'w-12 bg-primary-500' : 'w-8 bg-dark-surface2')}
            />
          ))}
        </div>

        {/* Step 1 — preset picker */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400 mb-2">Pick a membership shape that fits your business. Each preset creates the tier ladder + starter benefits; you can edit anything from Tiers / Benefits afterwards.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.presets.map(p => {
                const TileIcon = ICON_MAP[p.icon] ?? Star
                const active = selectedKey === p.key
                return (
                  <button
                    key={p.key}
                    onClick={() => setSelectedKey(p.key)}
                    className={'text-left rounded-xl border p-4 transition-all ' +
                      (active
                        ? 'border-amber-500/60 bg-amber-500/[0.08] ring-1 ring-amber-500/30'
                        : 'border-dark-border bg-dark-surface hover:border-amber-500/40 hover:bg-amber-500/[0.04]')}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={'w-9 h-9 rounded-md flex items-center justify-center ' +
                        (active ? 'bg-amber-500/25 text-amber-300' : 'bg-purple-500/15 text-purple-300')}>
                        <TileIcon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{p.label}</div>
                        {p.is_current && <div className="text-[10px] text-amber-400 font-semibold mt-0.5">Currently applied</div>}
                      </div>
                      {active && <Check size={16} className="text-amber-400 flex-shrink-0" />}
                    </div>
                    <p className="text-[11px] text-gray-500 line-clamp-2 mb-2 min-h-[28px]">{p.description}</p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {p.tier_names.map(n => (
                        <span key={n} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-dark-bg border border-dark-border text-gray-400">
                          {n}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-[9px] uppercase tracking-wide font-bold text-gray-500">
                      <span>{p.tier_count} tiers</span>
                      <span>·</span>
                      <span>{p.benefit_count} benefits</span>
                      <span>·</span>
                      <span className="text-amber-400">+{p.welcome_bonus} welcome pts</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 2 — demo data */}
        {step === 2 && picked && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400 mb-3">Want sample members + transactions to explore the dashboard before you onboard real members?</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setWithSample(true)}
                className={'rounded-xl border p-4 text-left transition-all ' +
                  (withSample ? 'border-primary-500 bg-primary-500/[0.08]' : 'border-dark-border bg-dark-surface hover:bg-dark-surface2')}>
                <div className="flex items-center gap-2 mb-2">
                  <Database size={16} className={withSample ? 'text-primary-400' : 'text-gray-500'} />
                  <span className="text-sm font-bold text-white">Add demo data</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">5 sample members across different tiers, 3 sample guests, a handful of point transactions to make the analytics pages look populated.</p>
              </button>
              <button onClick={() => setWithSample(false)}
                className={'rounded-xl border p-4 text-left transition-all ' +
                  (!withSample ? 'border-primary-500 bg-primary-500/[0.08]' : 'border-dark-border bg-dark-surface hover:bg-dark-surface2')}>
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={16} className={!withSample ? 'text-primary-400' : 'text-gray-500'} />
                  <span className="text-sm font-bold text-white">Start clean</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">No demo rows. The Members page will be empty until you import or add your first member — recommended for production.</p>
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — review */}
        {step === 3 && picked && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400 mb-3">Here's what we'll set up. Tier perks + earn rates are editable from Tiers right after.</p>

            <div className="bg-dark-surface border border-dark-border rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b border-dark-border">
                <div className="w-9 h-9 rounded-md bg-amber-500/15 flex items-center justify-center">
                  <Icon size={16} className="text-amber-400" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{picked.label}</div>
                  <div className="text-[11px] text-gray-500">{picked.description}</div>
                </div>
              </div>

              <ReviewRow label="Tier ladder" value={picked.tier_names.join(' → ')} />
              <ReviewRow label="Starter benefits" value={`${picked.benefit_count} benefit definitions added to your catalog`} />
              <ReviewRow label="Welcome bonus" value={`${picked.welcome_bonus} points per new member`} />
              <ReviewRow label="Demo data" value={withSample ? 'Yes — 5 sample members + transactions' : 'No'} />
            </div>

            <div className="bg-blue-500/[0.04] border border-blue-500/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle size={13} className="text-blue-300 flex-shrink-0 mt-0.5" />
                <div className="text-[11px] text-blue-100/90 leading-relaxed">
                  <p className="font-bold text-blue-200 mb-0.5">Existing data is preserved</p>
                  If you already have members assigned to tiers, we keep those tiers active and only ADD any
                  missing ones from this preset (so your historical assignments stay intact). Benefits are
                  added by code — existing ones are never overwritten.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1 || apply.isPending}
            className="px-4 py-2 text-sm text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5">
            <ArrowLeft size={14} /> Back
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(s => Math.min(3, s + 1))}
              disabled={!selectedKey}
              className="px-5 py-2 bg-primary-500 hover:bg-primary-400 text-white font-bold rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
              Continue <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={() => apply.mutate()}
              disabled={apply.isPending || !selectedKey}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg text-sm disabled:opacity-50 flex items-center gap-1.5">
              {apply.isPending ? 'Applying…' : <><Zap size={14} /> Apply preset</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="text-[11px] uppercase tracking-wide font-bold text-gray-500 w-28 flex-shrink-0 mt-0.5">{label}</span>
      <span className="text-sm text-white flex-1">{value}</span>
    </div>
  )
}
