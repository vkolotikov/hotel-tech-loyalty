/** A row of filters as pills, one chosen (aria-pressed buttons); a count after a label from 1. */
export function Tabs<T extends string>({ label, items, value, onChange }: {
  label: string
  items: { key: T; label: string; count?: number }[]
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
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
  )
}
