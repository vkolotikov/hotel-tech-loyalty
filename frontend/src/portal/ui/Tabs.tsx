export function Tabs({ value, onChange, items }: {
  value: string; onChange: (key: string) => void; items: Array<{ key: string; label: string; badge?: number }>
}) {
  return (
    <div role="tablist" className="flex gap-1 p-1 rounded-p-control bg-p-surface-2 overflow-x-auto">
      {items.map(item => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={`flex-1 whitespace-nowrap min-h-10 px-3 rounded-[10px] text-sm font-medium transition-colors
                        ${active ? 'bg-p-surface text-p-text shadow-p' : 'text-p-text-2 hover:text-p-text'}`}
          >
            {item.label}
            {item.badge != null && item.badge > 0 && (
              <span className="ml-1.5 inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-p-accent text-p-accent-ink text-[11px] font-bold">{item.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
