import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, X, Loader2 } from 'lucide-react'

/**
 * Confirmation modal for destructive entity deletes. Two modes:
 *   • simple     — Cancel / Delete buttons, blast-radius bullet list.
 *   • high-blast — Same plus a "type the name to confirm" input that
 *                  gates the Delete button. Use for customers / leads
 *                  that have many downstream FK rows.
 *
 * Esc + backdrop click close the modal (suppressed while loading).
 */
export interface DeleteConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  title: string
  entityName: string
  description?: string
  impacts?: string[]
  mode?: 'simple' | 'high-blast'
  confirmLabel?: string
}

export default function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  entityName,
  description,
  impacts,
  mode = 'simple',
  confirmLabel,
}: DeleteConfirmModalProps) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  // Reset internal state every time the modal is reopened.
  useEffect(() => {
    if (open) {
      setTyped('')
      setLoading(false)
      // Focus the first interactive control after the dialog mounts.
      setTimeout(() => {
        if (mode === 'high-blast') inputRef.current?.focus()
        else confirmBtnRef.current?.focus()
      }, 50)
    }
  }, [open, mode])

  // Esc-to-close. Suppressed while a confirm request is in flight so
  // we never orphan the parent's mutation state.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onClose])

  if (!open) return null

  const nameMatches = typed.trim() === entityName.trim()
  const canConfirm = !loading && (mode === 'simple' || nameMatches)

  const handleConfirm = async () => {
    if (!canConfirm) return
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      // Parent typically closes the modal on resolve; guard for the
      // case where it stays open after a rejected promise.
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-xl border border-red-500/30 bg-dark-surface shadow-2xl shadow-red-500/10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-500/15 ring-1 ring-red-500/30">
            <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
          </div>
          <div className="flex-1 pt-1">
            <h2
              id="delete-confirm-title"
              className="text-base font-semibold text-white"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !loading && onClose()}
            disabled={loading}
            aria-label={t('actions.close', 'Close')}
            className="rounded-lg p-1 text-gray-500 transition hover:bg-white/5 hover:text-gray-300 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-4 space-y-3">
          <p className="text-sm text-gray-300 leading-relaxed">
            {t('inquiries.delete.intro', 'This will permanently delete')}{' '}
            <strong className="font-semibold text-white">{entityName}</strong>.
          </p>

          {description && (
            <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
          )}

          {impacts && impacts.length > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-red-300/80">
                {t('inquiries.delete.blastRadius', 'This will also affect')}
              </div>
              <ul className="space-y-1 text-sm text-gray-300">
                {impacts.map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-red-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {mode === 'high-blast' && (
            <div className="pt-1">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                {t('inquiries.delete.typeToConfirm', "Type '{{name}}' to confirm", {
                  name: entityName,
                })}
              </label>
              <input
                ref={inputRef}
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={loading}
                placeholder={entityName}
                className="w-full rounded-lg border border-white/10 bg-dark-bg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 disabled:opacity-50"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3 bg-white/[0.02] rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            {t('actions.cancel', 'Cancel')}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-red-900/40 transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:ring-offset-2 focus:ring-offset-dark-surface disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-600"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel || t('actions.delete', 'Delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
