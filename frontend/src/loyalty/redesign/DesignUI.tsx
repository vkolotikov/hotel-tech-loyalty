import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { OverviewButton, OverviewDialog } from '../overview/OverviewUI'
import { useRedesignWords } from './words'
import { steppedValue } from './designMath'
import { useLook } from '../lib/look'
import { useMobileWords } from '../mobile/words'

export function DesignDialog({ title, onClose, busy, wide, children, className = '' }: { title: string; onClose: () => void; busy?: boolean; wide?: boolean; children: ReactNode; className?: string }) {
  const look = useLook()
  const mobile = useMobileWords()
  return <div data-loyalty="" data-overview="" data-redesign="" data-theme={look.resolved} className="l-rd-dialog-root"><OverviewDialog title={title} kind="form" busy={busy} className={`${wide ? 'l-rd-dialog-wide' : ''} ${className}`} backLabel={className.includes('l-mw-full-form') ? mobile('back') : undefined} onClose={onClose}>{children}</OverviewDialog></div>
}

export function NumberControl({ label, value, onValue, step = 1, min = 0, max, invalid, disabled, inputRef, ...props }: {
  label: string; value: string; onValue: (value: string) => void; step?: number; min?: number; max?: number; invalid?: boolean;
  disabled?: boolean; inputRef?: React.Ref<HTMLInputElement>
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'step' | 'min' | 'max'>) {
  const say = useRedesignWords()
  const id = useId()
  return <div className="l-rd-stepper">
    <OverviewButton type="button" disabled={disabled} aria-label={say('decrease', { label })} aria-controls={id} onClick={() => onValue(steppedValue(value, -step, min, max))}>−</OverviewButton>
    <input {...props} id={id} ref={inputRef} type="number" inputMode={step < 1 ? 'decimal' : 'numeric'} aria-label={label} aria-invalid={invalid || undefined} value={value} min={min} max={max} step={step} disabled={disabled} onChange={e => onValue(e.target.value)} />
    <OverviewButton type="button" disabled={disabled} aria-label={say('increase', { label })} aria-controls={id} onClick={() => onValue(steppedValue(value, step, min, max))}>+</OverviewButton>
  </div>
}
