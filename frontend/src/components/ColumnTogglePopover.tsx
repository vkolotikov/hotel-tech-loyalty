import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Columns } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { useSettings } from '../lib/crmSettings'

/**
 * Inline column-visibility toggle popover.
 *
 * Mounted next to the Filters button on /leads (`inquiry_fields`) and
 * /deals (`deal_fields`). Writes the merged config back via
 * `PUT /v1/admin/crm-settings/{settingKey}` with `{ value: <object> }`
 * — the same endpoint the FieldManagerPanel uses, so the two surfaces
 * stay in sync. Optimistic cache patching means the column flips the
 * instant the user clicks the switch; on server error we roll back.
 *
 * Heavy-customization (form fields, detail-page sections, custom
 * fields, layout import/export) stays in Settings → Pipelines & Fields
 * — the popover header links there.
 */

export interface ColumnToggleField {
  key: string
  label: string
  description?: string
  /** When true, the row renders as a non-interactive "Always shown" pill. */
  alwaysOn?: boolean
}

interface ColumnTogglePopoverProps {
  settingKey: 'inquiry_fields' | 'deal_fields'
  /** Future-proof — today we only ship list-column toggles. */
  section: 'list'
  fields: ColumnToggleField[]
}

export default function ColumnTogglePopover({ settingKey, section, fields }: ColumnTogglePopoverProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const settings = useSettings()
  const btnRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  // Current saved values for this (settingKey, section) tuple. Falls
  // back to true so unknown / freshly-added keys default to visible.
  const current: Record<string, boolean> = (settings as any)?.[settingKey]?.[section] ?? {}
  const valueOf = (k: string) => current[k] !== false

  // PUT the full merged nested object back. Optimistic patching of the
  // ['crm-settings'] query cache so every consumer (the leads table,
  // FieldManagerPanel, etc.) re-renders without waiting for the
  // refetch. Rollback to the snapshot on server error.
  const saveMutation = useMutation({
    mutationFn: (nextSection: Record<string, boolean>) => {
      const nextFull = {
        ...((settings as any)[settingKey] ?? {}),
        [section]: nextSection,
      }
      return api.put(`/v1/admin/crm-settings/${settingKey}`, { value: nextFull })
    },
    onMutate: async (nextSection) => {
      await qc.cancelQueries({ queryKey: ['crm-settings'] })
      const snapshot = qc.getQueryData<Record<string, any>>(['crm-settings'])
      qc.setQueryData<Record<string, any>>(['crm-settings'], (prev) => {
        const base = prev ?? {}
        const prevEntity = base[settingKey] ?? {}
        return {
          ...base,
          [settingKey]: { ...prevEntity, [section]: nextSection },
        }
      })
      return { snapshot }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(['crm-settings'], ctx.snapshot)
      toast.error(t('inquiries.columns.save_error', { defaultValue: "Couldn't save column settings" }))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-settings'] })
    },
  })

  const toggle = (key: string) => {
    const field = fields.find(f => f.key === key)
    if (!field || field.alwaysOn) return
    const next = { ...current, [key]: !valueOf(key) }
    saveMutation.mutate(next)
  }

  const setAll = (val: boolean) => {
    const next = { ...current }
    for (const f of fields) {
      if (f.alwaysOn) continue
      next[f.key] = val
    }
    saveMutation.mutate(next)
  }

  const handleOpen = () => {
    if (!btnRef.current) return
    setAnchor(btnRef.current.getBoundingClientRect())
    setOpen(true)
  }

  // Close on outside click + Esc. Listeners only attach while open so
  // the closed state pays no per-frame cost.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popoverRef.current?.contains(t)) return
      if (btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Anchored bottom-end of the trigger; flips above when too close to
  // the viewport bottom (mirrors the openMenu pattern at L1526-1586 of
  // Inquiries.tsx).
  const POP_W = 280
  const POP_MAX_H = 440
  const top = anchor
    ? (anchor.bottom + POP_MAX_H + 16 > window.innerHeight
      ? Math.max(8, anchor.top - 8 - POP_MAX_H)
      : anchor.bottom + 6)
    : 0
  const right = anchor ? Math.max(8, window.innerWidth - anchor.right) : undefined

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className={`flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${open ? 'bg-primary-500/15 border border-primary-500/30 text-primary-300' : 'bg-dark-surface border border-dark-border text-t-secondary hover:text-white hover:border-primary-500'}`}
        aria-haspopup="true"
        aria-expanded={open}>
        <Columns size={14} />
        <span className="hidden md:inline">{t('inquiries.columns.button', { defaultValue: 'Columns' })}</span>
      </button>

      {open && anchor && (
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top, right, width: POP_W, maxHeight: POP_MAX_H, zIndex: 60 }}
          className="bg-dark-surface border border-dark-border rounded-lg shadow-lg flex flex-col">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-dark-border flex items-center justify-between">
            <span className="text-sm font-semibold text-white">
              {t('inquiries.columns.title', { defaultValue: 'Columns' })}
            </span>
            <Link
              to="/settings?tab=pipelines-fields"
              onClick={() => setOpen(false)}
              className="text-[11px] text-primary-400 hover:text-primary-300">
              {t('inquiries.columns.manage_link', { defaultValue: 'Manage all in Settings' })}
            </Link>
          </div>

          {/* Toggle rows */}
          <div className="flex-1 overflow-y-auto px-1 py-1">
            {fields.map(f => {
              const on = f.alwaysOn ? true : valueOf(f.key)
              return (
                <button
                  key={f.key}
                  type="button"
                  disabled={f.alwaysOn || saveMutation.isPending}
                  onClick={() => toggle(f.key)}
                  className={`w-full text-left px-2.5 py-2 rounded-md flex items-start gap-2.5 transition-colors ${f.alwaysOn ? 'cursor-default' : 'hover:bg-white/[0.04] disabled:opacity-60'}`}>
                  {/* Switch */}
                  <span
                    className={`relative inline-flex shrink-0 h-4 w-7 mt-0.5 items-center rounded-full transition-colors ${on ? 'bg-primary-500' : 'bg-white/10'} ${f.alwaysOn ? 'opacity-60' : ''}`}
                    aria-hidden="true">
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </span>
                  {/* Label + description */}
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium text-white truncate">{f.label}</span>
                    {f.description && (
                      <span className="block text-[11px] text-t-secondary leading-snug mt-0.5">{f.description}</span>
                    )}
                    {f.alwaysOn && (
                      <span className="inline-block mt-1 text-[10px] uppercase tracking-wide text-t-secondary/80">
                        {t('inquiries.columns.always_on', { defaultValue: 'Always shown' })}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-dark-border flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setAll(true)}
              disabled={saveMutation.isPending}
              className="text-[11px] font-medium text-t-secondary hover:text-white disabled:opacity-40">
              {t('inquiries.columns.all_on', { defaultValue: 'All on' })}
            </button>
            <button
              type="button"
              onClick={() => setAll(false)}
              disabled={saveMutation.isPending}
              className="text-[11px] font-medium text-t-secondary hover:text-white disabled:opacity-40">
              {t('inquiries.columns.reset', { defaultValue: 'Reset' })}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
