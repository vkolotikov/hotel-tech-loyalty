import type { ReactNode } from 'react'

export const INPUT_CLASS =
  'w-full min-h-11 bg-p-surface border border-p-border rounded-p-control px-3 py-2 text-base sm:text-sm text-p-text ' +
  'placeholder:text-p-text-2 focus:border-p-accent focus:outline-none disabled:opacity-60'

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-p-text-2 mb-1">{label}</span>
      {children}
      {error ? <span className="block text-xs text-p-danger mt-1">{error}</span>
             : hint ? <span className="block text-[11px] text-p-text-2 mt-1">{hint}</span> : null}
    </label>
  )
}
