import { Search } from 'lucide-react'
import type { ComponentProps, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

/** The look of every text box, list box and text area here. */
export const CONTROL = 'w-full rounded-xl border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text placeholder:text-a-text-2 focus:border-a-accent focus:outline-hidden focus:ring-2 focus:ring-a-accent/25 disabled:opacity-60'

/** A text box; its `ref` reaches the input (React 19 passes it as a prop). */
export function TextInput(props: ComponentProps<'input'>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CONTROL} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ''}`} />
}

/** A search box with its magnifier; `label` is its name and placeholder. */
export function SearchInput({ label, value, onChange, className = '' }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{label}</span>
      <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-a-text-2" />
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={label} className={`${CONTROL} pl-9`} />
    </label>
  )
}

/** A switch: a checkbox drawn as a track, its label beside it. */
export function Toggle({ label, checked, onChange, disabled = false, hint }: { label: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span aria-hidden className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-a-border transition-colors peer-checked:bg-a-accent peer-focus-visible:ring-2 peer-focus-visible:ring-a-accent/40 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-a-surface after:shadow-a-sm after:transition-transform peer-checked:after:translate-x-4" />
      <span className="min-w-0">
        <span className="block text-sm text-a-text">{label}</span>
        {hint && <span className="block text-xs text-a-text-2">{hint}</span>}
      </span>
    </label>
  )
}
