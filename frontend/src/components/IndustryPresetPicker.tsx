import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  Building2, Sparkles, Stethoscope, Scale, Home,
  GraduationCap, Dumbbell, Utensils, Briefcase,
  CheckCircle2, X, Star, Zap, Info,
} from 'lucide-react'

/**
 * One-click industry setup. Top of Settings → Pipelines tab.
 *
 * Reshapes the entire CRM (pipeline name + stages, lost reasons,
 * Add Inquiry layout, custom fields) for the chosen vertical.
 * Designed for non-technical users — pick a card, confirm the
 * change, done.
 *
 * Existing data is preserved:
 *   • Open inquiries migrate to the closest-kind new stage.
 *   • Lost reasons in use are soft-deactivated, not deleted.
 *   • Custom-field values stay on entity rows even if the field
 *     type changes between presets.
 */

const PRESET_ICONS: Record<string, any> = {
  'building-2':     Building2,
  'sparkles':       Sparkles,
  'stethoscope':    Stethoscope,
  'scale':          Scale,
  'home':           Home,
  'graduation-cap': GraduationCap,
  'dumbbell':       Dumbbell,
  'utensils':       Utensils,
  'briefcase':      Briefcase,
}

interface PresetMeta {
  key: string
  label: string
  description: string
  icon: string
  pipeline_name: string
  stage_count: number
  reason_count: number
  field_count: number
  is_current: boolean
}

interface PresetsResponse {
  presets: PresetMeta[]
  current: string | null
}

export function IndustryPresetPicker() {
  const qc = useQueryClient()
  const [confirming, setConfirming] = useState<PresetMeta | null>(null)

  const { data } = useQuery<PresetsResponse>({
    queryKey: ['industry-presets'],
    queryFn: () => api.get('/v1/admin/industry-presets').then(r => r.data),
  })

  const apply = useMutation({
    mutationFn: (key: string) => api.post('/v1/admin/industry-presets/apply', { preset: key }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['industry-presets'] })
      qc.invalidateQueries({ queryKey: ['admin-pipelines'] })
      qc.invalidateQueries({ queryKey: ['admin-lost-reasons'] })
      qc.invalidateQueries({ queryKey: ['custom-fields-admin'] })
      qc.invalidateQueries({ queryKey: ['custom-fields-admin-all'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      qc.invalidateQueries({ queryKey: ['custom-field-presets'] })
      qc.invalidateQueries({ queryKey: ['crm-settings'] })
      toast.success(res.data?.message ?? 'Preset applied')
      setConfirming(null)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Could not apply preset')
    },
  })

  if (!data) return null

  const currentLabel = data.presets.find(p => p.is_current)?.label
    ?? (data.current ? data.current : 'Hotel (default)')

  return (
    <div className="bg-gradient-to-br from-amber-500/10 via-purple-500/[0.05] to-cyan-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
            <Zap size={16} className="text-amber-300" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Quick setup by industry
            </h2>
            <p className="text-xs text-t-secondary mt-0.5 max-w-2xl leading-snug">
              One click reshapes the whole CRM — pipeline stages, lost reasons, form fields, and custom fields —
              to match how your industry actually works. Switch any time; saved leads are preserved.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-dark-bg border border-dark-border">
          <Star size={11} className="text-amber-300 fill-amber-300" />
          <span className="text-t-secondary">Currently:</span>
          <span className="text-white font-bold">{currentLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {data.presets.map(p => {
          const Icon = PRESET_ICONS[p.icon] ?? Briefcase
          return (
            <button
              key={p.key}
              onClick={() => setConfirming(p)}
              className={`text-left rounded-lg border p-2.5 transition group ${
                p.is_current
                  ? 'border-amber-500/50 bg-amber-500/[0.06] cursor-default'
                  : 'border-dark-border bg-dark-bg hover:border-amber-500/40 hover:bg-amber-500/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
                  p.is_current ? 'bg-amber-500/20 border border-amber-500/40' : 'bg-purple-500/15 border border-purple-500/30 group-hover:scale-110 transition'
                }`}>
                  <Icon size={13} className={p.is_current ? 'text-amber-300' : 'text-purple-300'} />
                </div>
                <p className="text-sm font-bold text-white truncate flex-1">{p.label}</p>
                {p.is_current && (
                  <CheckCircle2 size={13} className="text-amber-400 flex-shrink-0" />
                )}
              </div>
              <p className="text-[10px] text-t-secondary leading-snug line-clamp-2 min-h-[24px]">
                {p.description}
              </p>
              <div className="flex items-center gap-2 mt-1.5 text-[9px] text-t-secondary uppercase tracking-wide font-bold">
                <span>{p.stage_count} stages</span>
                <span>·</span>
                <span>{p.reason_count} reasons</span>
                {p.field_count > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-purple-300">+{p.field_count} fields</span>
                  </>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {confirming && (
        <ConfirmModal
          preset={confirming}
          isCurrent={confirming.is_current}
          onCancel={() => setConfirming(null)}
          onConfirm={() => apply.mutate(confirming.key)}
          applying={apply.isPending}
        />
      )}
    </div>
  )
}

function ConfirmModal({ preset, isCurrent, onCancel, onConfirm, applying }: {
  preset: PresetMeta
  isCurrent: boolean
  onCancel: () => void
  onConfirm: () => void
  applying: boolean
}) {
  const Icon = PRESET_ICONS[preset.icon] ?? Briefcase

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={applying ? undefined : onCancel}
    >
      <div
        className="bg-dark-surface border border-dark-border rounded-xl p-5 w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
              <Icon size={18} className="text-purple-300" />
            </div>
            <h3 className="text-lg font-bold text-white">Apply {preset.label}?</h3>
          </div>
          <button
            onClick={onCancel}
            disabled={applying}
            className="p-1.5 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {isCurrent ? (
          <p className="text-sm text-t-secondary mb-4">
            This is your current preset. Re-applying restores the canonical pipeline + lost reasons + layout
            for {preset.label}, and tops up any preset fields you may have removed.
          </p>
        ) : (
          <p className="text-sm text-t-secondary mb-4">
            One click reshapes the CRM for <span className="text-white font-semibold">{preset.label}</span>.
            You can switch back any time.
          </p>
        )}

        <div className="bg-dark-bg border border-dark-border rounded-lg p-3 space-y-2 mb-4">
          <p className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1">What changes</p>
          <ChangeRow
            label={`Pipeline → "${preset.pipeline_name}" (${preset.stage_count} stages)`}
          />
          <ChangeRow label={`${preset.reason_count} lost reasons`} />
          <ChangeRow label="Form fields tuned for this industry" />
          {preset.field_count > 0 && (
            <ChangeRow label={`+${preset.field_count} starter custom fields`} accent />
          )}
        </div>

        <div className="bg-blue-500/[0.04] border border-blue-500/20 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <Info size={13} className="text-blue-300 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-blue-100/90 leading-relaxed">
              <p className="font-bold text-blue-200 mb-0.5">Your data is safe</p>
              Open leads move to the new pipeline's matching stage (won deals stay won, lost stays lost).
              Custom-field values on existing records are preserved even if a field is hidden.
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={applying}
            className="px-4 py-2 text-sm text-t-secondary hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={applying}
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {applying ? 'Applying…' : <><Zap size={14} /> Apply preset</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChangeRow({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <CheckCircle2 size={12} className={accent ? 'text-purple-300' : 'text-emerald-400'} />
      <span className="text-white">{label}</span>
    </div>
  )
}
