import { Select } from './inputs'

/** A row of filters as pills, one chosen (aria-pressed buttons); a count after a label from 1. */
export function Tabs<T extends string>({ label, items, value, onChange, compact = false }: {
  label: string
  compact?: boolean
  items: { key: T; label: string; count?: number }[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <>
      {compact && <label className="flex min-w-0 max-w-sm flex-col gap-1 md:hidden">
        <span className="text-xs font-medium text-a-text-2">{label}</span>
        <Select value={value} onChange={e => { const next = items.find(item => item.key === e.target.value); if (next) onChange(next.key) }}>
          {items.map(item => <option key={item.key} value={item.key}>{item.label}{item.count !== undefined ? ` (${item.count})` : ''}</option>)}
        </Select>
      </label>}
      <div role="group" aria-label={label} className={`${compact ? 'hidden md:flex' : 'flex'} flex-wrap gap-1.5`}>
      {items.map(item => {
        const on = item.key === value
        return (
          <button key={item.key} type="button" aria-pressed={on} onClick={() => onChange(item.key)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${on ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span className={`min-w-5 rounded-full px-1.5 text-center text-xs leading-5 ${on ? 'bg-a-accent-ink/20 text-a-accent-ink' : 'bg-a-surface-2 text-a-text'}`}>{item.count}</span>
            )}
          </button>
        )
      })}
      </div>
    </>
  )
}
