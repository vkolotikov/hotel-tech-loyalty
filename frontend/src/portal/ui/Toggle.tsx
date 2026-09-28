import type { ReactNode } from 'react'

export function Toggle({ label, hint, checked, onChange, disabled }: {
  label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 min-h-11">
      <div className="min-w-0">
        <p className="text-sm text-p-text">{label}</p>
        {hint && <p className="text-[11px] text-p-text-2 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        // The button is the 44px target; the track is drawn inside it. The
        // thumb needs left-0: an absolute child with no inset sits at its
        // static position, which a button centres.
        className="shrink-0 w-11 h-11 -my-2.5 flex items-center rounded-full disabled:opacity-50"
      >
        <span aria-hidden className={`relative block w-11 h-6 rounded-full transition-colors ${checked ? 'bg-p-accent' : 'bg-p-border'}`}>
          <span className={`absolute left-0 top-0.5 w-5 h-5 rounded-full bg-p-surface shadow-p transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </span>
      </button>
    </div>
  )
}
