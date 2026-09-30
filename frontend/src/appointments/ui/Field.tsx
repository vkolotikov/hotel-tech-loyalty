import type { ReactNode } from 'react'

/** A labelled control. The label wraps the control, so it needs no id. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-a-text-2 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-a-text-2 mt-1">{hint}</span>}
    </label>
  )
}
