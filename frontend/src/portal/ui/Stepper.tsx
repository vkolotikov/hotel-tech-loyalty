import { Minus, Plus } from 'lucide-react'

interface Props { label: string; value: number; min: number; max: number; onChange: (v: number) => void; fewerLabel?: string; moreLabel?: string }

/** A labelled −/+ pair for small counts. 44 px targets; the value is announced. */
export function Stepper({ label, value, min, max, onChange, fewerLabel = 'Fewer', moreLabel = 'More' }: Props) {
  const btn = 'w-11 h-11 rounded-p-control border border-p-border bg-p-surface text-p-text flex items-center justify-center disabled:opacity-40'
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} aria-label={fewerLabel} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}><Minus size={16} aria-hidden /></button>
        <span className="w-8 text-center tabular-nums" aria-live="polite">{value}</span>
        <button type="button" className={btn} aria-label={moreLabel} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={16} aria-hidden /></button>
      </div>
    </div>
  )
}
