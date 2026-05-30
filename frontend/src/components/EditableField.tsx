import {
  useState, useRef, useEffect, useCallback, useMemo,
  type KeyboardEvent, type FocusEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Check, X as XIcon, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * EditableField — general-purpose inline-editable cell.
 *
 * Click (or Tab) to enter edit mode. Blur to auto-commit for single-line
 * variants; explicit Save / Cancel for textarea. Esc to abort. Optimistic
 * save handled by the caller via the `onSave` promise — this component
 * shows a spinner while the promise is pending and rolls back the in-memory
 * draft (re-displaying the original value) on rejection, plus a toast.
 *
 * Sized identically in display + edit mode (same padding + min-height)
 * to prevent layout shift when activated inside a table row or accordion.
 */

export type EditableFieldVariant =
  | 'text' | 'email' | 'phone' | 'number'
  | 'textarea' | 'select' | 'date'

export interface EditableFieldOption {
  value: string
  label: string
}

export interface EditableFieldProps {
  value: string | number | null
  onSave: (newValue: string | number | null) => Promise<void>
  variant?: EditableFieldVariant
  label?: string
  placeholder?: string
  options?: EditableFieldOption[]
  readOnly?: boolean
  helperText?: string
  error?: string
  className?: string
  formatDisplay?: (v: any) => React.ReactNode
}

// Standard input style mirrors TaskDrawer.tsx (lines 236, 269, 355).
const INPUT_BASE =
  'w-full bg-dark-bg border border-primary-500 rounded-md px-2.5 py-1.5 ' +
  'text-sm text-white placeholder-t-secondary outline-none ' +
  'focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30'

// Display wrapper — same padding so the cell does not jump on click.
const DISPLAY_BASE =
  'group relative w-full px-2.5 py-1.5 rounded-md text-sm cursor-text ' +
  'min-h-[34px] flex items-center transition-colors ' +
  'hover:bg-white/[0.04] focus:outline-none focus:bg-white/[0.04] ' +
  'focus:ring-2 focus:ring-primary-500/30'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clientValidate(
  variant: EditableFieldVariant,
  raw: string,
): string | null {
  if (raw === '') return null // empty is allowed — caller decides required-ness
  if (variant === 'email' && !EMAIL_RE.test(raw)) return 'Invalid email'
  if (variant === 'number' && Number.isNaN(Number(raw))) return 'Must be a number'
  return null
}

export default function EditableField(props: EditableFieldProps) {
  const {
    value,
    onSave,
    variant = 'text',
    label,
    placeholder,
    options,
    readOnly,
    helperText,
    error: externalError,
    className,
    formatDisplay,
  } = props

  const { t } = useTranslation()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value))
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null)
  // Track the latest committed string so blur-after-save doesn't re-fire.
  const lastCommittedRef = useRef<string>(value == null ? '' : String(value))

  // External value changes (e.g. parent refetch) reset the draft.
  useEffect(() => {
    const next = value == null ? '' : String(value)
    setDraft(next)
    lastCommittedRef.current = next
  }, [value])

  // Autofocus + caret-to-end when entering edit mode.
  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    if ('setSelectionRange' in el && el instanceof HTMLInputElement) {
      try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* noop */ }
    } else if (el instanceof HTMLTextAreaElement) {
      try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* noop */ }
    }
  }, [editing])

  const enterEdit = useCallback(() => {
    if (readOnly || saving) return
    setLocalError(null)
    setEditing(true)
  }, [readOnly, saving])

  const cancel = useCallback(() => {
    setDraft(lastCommittedRef.current)
    setLocalError(null)
    setEditing(false)
  }, [])

  const commit = useCallback(async () => {
    const trimmed = variant === 'textarea' ? draft : draft.trim()

    // No-op if value hasn't actually changed.
    if (trimmed === lastCommittedRef.current) {
      setEditing(false)
      return
    }

    const validationErr = clientValidate(variant, trimmed)
    if (validationErr) {
      setLocalError(validationErr)
      // Stay in edit mode so the user can fix it.
      return
    }

    let toSend: string | number | null = trimmed === '' ? null : trimmed
    if (variant === 'number' && toSend !== null) {
      toSend = Number(toSend)
    }

    setSaving(true)
    setLocalError(null)
    try {
      await onSave(toSend)
      lastCommittedRef.current = trimmed
      setEditing(false)
    } catch (err: any) {
      // Roll back the visible draft to the last good value + surface a toast.
      // Field-level server errors should arrive via the `error` prop after
      // the parent processes the 422 response.
      setDraft(lastCommittedRef.current)
      const msg = err?.response?.data?.message
        || err?.message
        || t('editableField.save_failed', { defaultValue: 'Save failed' })
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }, [draft, variant, onSave, t])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
      return
    }
    if (e.key === 'Enter' && variant !== 'textarea') {
      e.preventDefault()
      void commit()
      return
    }
    // Ctrl/Cmd + Enter to save from a textarea.
    if (e.key === 'Enter' && variant === 'textarea' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void commit()
    }
  }, [variant, commit, cancel])

  const handleBlur = useCallback((_e: FocusEvent) => {
    // Textarea uses explicit Save/Cancel; do not auto-commit on blur,
    // otherwise clicking the Save button itself would race with the blur.
    if (variant === 'textarea') return
    void commit()
  }, [variant, commit])

  // -- Display rendering --------------------------------------------------
  const isEmpty = value == null || value === ''

  const displayValue = useMemo(() => {
    if (formatDisplay) return formatDisplay(value)
    if (isEmpty) return null
    if (variant === 'select' && options) {
      const match = options.find(o => o.value === String(value))
      return match ? match.label : String(value)
    }
    return String(value)
  }, [value, isEmpty, variant, options, formatDisplay])

  const effectivePlaceholder = placeholder
    || t('editableField.add', { defaultValue: 'Add…' })

  const showError = localError ?? externalError ?? null

  // -- Render -------------------------------------------------------------
  if (!editing) {
    return (
      <div className={className}>
        <div
          role="button"
          tabIndex={readOnly ? -1 : 0}
          aria-label={label}
          aria-readonly={readOnly || undefined}
          onClick={enterEdit}
          onFocus={() => { /* keep focusable but don't auto-edit on focus */ }}
          onKeyDown={(e) => {
            if (readOnly) return
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'F2') {
              e.preventDefault()
              enterEdit()
            }
          }}
          className={
            DISPLAY_BASE + ' ' +
            (readOnly ? 'cursor-default opacity-80 ' : '') +
            (isEmpty
              ? 'text-t-secondary italic '
              : 'text-white ')
          }
        >
          {isEmpty ? (
            <span className="border-b border-dashed border-white/20">
              {effectivePlaceholder}
            </span>
          ) : (
            <span
              className={
                readOnly
                  ? ''
                  : 'border-b border-dotted border-transparent group-hover:border-white/30'
              }
            >
              {displayValue}
            </span>
          )}

          {variant === 'select' && !readOnly && (
            <ChevronDown
              className="ml-auto h-3.5 w-3.5 opacity-40 group-hover:opacity-70"
              aria-hidden="true"
            />
          )}

          {saving && (
            <Loader2
              className="absolute right-2 top-1.5 h-3.5 w-3.5 animate-spin text-primary-500"
              aria-hidden="true"
            />
          )}
        </div>

        {helperText && !showError && (
          <div className="mt-1 px-2.5 text-[11px] text-gray-400">{helperText}</div>
        )}
        {showError && (
          <div className="mt-1 px-2.5 text-[11px] text-red-400">{showError}</div>
        )}
      </div>
    )
  }

  // ---- Edit mode --------------------------------------------------------
  return (
    <div className={className}>
      <div className="relative">
        {variant === 'textarea' && (
          <textarea
            ref={inputRef as any}
            aria-label={label}
            role="textbox"
            aria-multiline="true"
            value={draft}
            placeholder={effectivePlaceholder}
            disabled={saving}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            className={INPUT_BASE + ' resize-y min-h-[80px]'}
          />
        )}

        {variant === 'select' && (
          <select
            ref={inputRef as any}
            aria-label={label}
            role="combobox"
            value={draft}
            disabled={saving}
            onChange={(e) => {
              setDraft(e.target.value)
              // Selects commit immediately on change — matches the
              // "open native select on click" behavior in the spec.
              setTimeout(() => { void commitFromValue(e.target.value) }, 0)
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={INPUT_BASE + ' min-h-[34px] appearance-none pr-8'}
          >
            <option value="">{effectivePlaceholder}</option>
            {(options ?? []).map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}

        {(variant === 'text' || variant === 'email' || variant === 'phone'
          || variant === 'number' || variant === 'date') && (
          <input
            ref={inputRef as any}
            aria-label={label}
            role="textbox"
            type={
              variant === 'email' ? 'email'
              : variant === 'phone' ? 'tel'
              : variant === 'number' ? 'number'
              : variant === 'date' ? 'date'
              : 'text'
            }
            inputMode={variant === 'number' ? 'decimal' : variant === 'phone' ? 'tel' : undefined}
            value={draft}
            placeholder={effectivePlaceholder}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={INPUT_BASE + ' min-h-[34px]'}
          />
        )}

        {saving && (
          <Loader2
            className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-primary-500"
            aria-hidden="true"
          />
        )}
      </div>

      {variant === 'textarea' && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void commit()}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md bg-primary-500 px-2.5 py-1 text-xs font-medium text-black hover:bg-primary-400 disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" />
            {t('editableField.save', { defaultValue: 'Save' })}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md border border-dark-border bg-dark-bg px-2.5 py-1 text-xs text-t-secondary hover:text-white"
          >
            <XIcon className="h-3.5 w-3.5" />
            {t('editableField.cancel', { defaultValue: 'Cancel' })}
          </button>
          <span className="ml-1 text-[11px] text-gray-500">
            {t('editableField.shortcut_hint', { defaultValue: 'Cmd/Ctrl + Enter to save · Esc to cancel' })}
          </span>
        </div>
      )}

      {helperText && !showError && (
        <div className="mt-1 px-2.5 text-[11px] text-gray-400">{helperText}</div>
      )}
      {showError && (
        <div className="mt-1 px-2.5 text-[11px] text-red-400">{showError}</div>
      )}
    </div>
  )

  // ---- Helpers --------------------------------------------------------
  // Select commits using the just-chosen value rather than `draft` state,
  // because setDraft + commit() in the same tick would still see the old draft.
  async function commitFromValue(next: string) {
    const trimmed = next.trim()
    if (trimmed === lastCommittedRef.current) {
      setEditing(false)
      return
    }
    setSaving(true)
    setLocalError(null)
    try {
      const payload: string | number | null = trimmed === '' ? null : trimmed
      await onSave(payload)
      lastCommittedRef.current = trimmed
      setEditing(false)
    } catch (err: any) {
      setDraft(lastCommittedRef.current)
      const msg = err?.response?.data?.message
        || err?.message
        || t('editableField.save_failed', { defaultValue: 'Save failed' })
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }
}
