import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  withTime?: boolean
  required?: boolean
  min?: string
  describedBy?: string
}

const iso = (day: Date) => `${String(day.getFullYear()).padStart(4, '0')}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
const dayOf = (value: string) => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!parts) return null
  const day = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
  return iso(day) === parts[0] ? day : null
}
const move = (day: Date, offset: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + offset)
const months = Array.from({ length: 12 }, (_, month) => new Date(2026, month, 1).toLocaleDateString('en', { month: 'long' }))

/** Calendar days and booking wall-clock times stay as written; no UTC conversion. */
export function BookingPromotionDateField({ label, value, onChange, withTime, required, min, describedBy }: Props) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(() => iso(dayOf(value) ?? new Date()))
  const [view, setView] = useState(() => dayOf(value) ?? new Date())
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const selected = value.slice(0, 10)
  const minDay = min?.slice(0, 10) || ''
  const today = iso(new Date())

  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
  const show = () => {
    const initial = dayOf(selected >= minDay ? value : minDay) ?? dayOf(minDay) ?? new Date()
    setView(initial)
    setFocused(iso(initial))
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open || !popup.current || !root.current) return
    const place = () => {
      if (!root.current || !popup.current) return
      const anchor = root.current.getBoundingClientRect()
      const box = popup.current.getBoundingClientRect()
      const below = anchor.bottom + 8
      setPosition({
        left: Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12)),
        top: below + box.height <= window.innerHeight - 12 ? below : Math.max(12, anchor.top - box.height - 8),
      })
    }
    place()
    popup.current.querySelector<HTMLElement>(`[data-day="${focused}"]`)?.focus({ preventScroll: true })
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, focused])

  useLayoutEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('pointerdown', outside)
    }
  }, [open])

  const choose = (date: string) => {
    let next = withTime ? `${date}T${value.slice(11, 16) || '00:00'}` : date
    if (min && next < min) next = min
    onChange(next)
    close()
  }
  const changeMonth = (year: number, month: number) => setView(new Date(year, month, 1))
  const navigateDay = (event: KeyboardEvent, date: Date) => {
    let next: Date
    if (event.key === 'ArrowLeft') next = move(date, -1)
    else if (event.key === 'ArrowRight') next = move(date, 1)
    else if (event.key === 'ArrowUp') next = move(date, -7)
    else if (event.key === 'ArrowDown') next = move(date, 7)
    else if (event.key === 'Home') next = move(date, -((date.getDay() + 6) % 7))
    else if (event.key === 'End') next = move(date, 6 - ((date.getDay() + 6) % 7))
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const month = date.getMonth() + (event.key === 'PageUp' ? -1 : 1)
      next = new Date(date.getFullYear(), month, Math.min(date.getDate(), new Date(date.getFullYear(), month + 1, 0).getDate()))
    } else return
    event.preventDefault()
    if (minDay && iso(next) < minDay) next = dayOf(minDay)!
    setView(next)
    setFocused(iso(next))
  }
  const first = new Date(view.getFullYear(), view.getMonth(), 1)
  const start = move(first, -((first.getDay() + 6) % 7))
  const cells = Array.from({ length: 42 }, (_, index) => move(start, index))
  const tabDay = cells.some(day => iso(day) === focused) ? focused : cells.find(day => day.getMonth() === view.getMonth() && iso(day) >= minDay)
  const tabDate = typeof tabDay === 'string' ? tabDay : tabDay ? iso(tabDay) : ''

  return <div ref={root} className="bp-date" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false) }}>
    <label htmlFor={id}>{label}</label>
    <div className="bp-date-control">
      <input id={id} aria-describedby={describedBy} type={withTime ? 'datetime-local' : 'date'} value={value} required={required} min={min || undefined}
        onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); show() } }} />
      <button ref={trigger} type="button" aria-label={`Choose ${label.toLowerCase()}`} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? `${id}-calendar` : undefined} onClick={() => open ? close() : show()}><CalendarDays size={18} /></button>
    </div>
    {open && <div ref={popup} id={`${id}-calendar`} role="dialog" aria-label={`${label} calendar`} className="bp-calendar" style={position}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }}>
      <div className="bp-calendar-navigation">
        <button type="button" aria-label="Previous month" onClick={() => changeMonth(view.getFullYear(), view.getMonth() - 1)}><ChevronLeft size={18} /></button>
        <select aria-label="Calendar month" value={view.getMonth()} onChange={event => changeMonth(view.getFullYear(), Number(event.target.value))}>{months.map((name, month) => <option key={name} value={month}>{name}</option>)}</select>
        <select aria-label="Calendar year" value={view.getFullYear()} onChange={event => changeMonth(Number(event.target.value), view.getMonth())}>{Array.from({ length: 21 }, (_, index) => view.getFullYear() - 10 + index).filter(year => year >= 100 && year <= 9999).map(year => <option key={year} value={year}>{year}</option>)}</select>
        <button type="button" aria-label="Next month" onClick={() => changeMonth(view.getFullYear(), view.getMonth() + 1)}><ChevronRight size={18} /></button>
      </div>
      <div role="grid" aria-label={view.toLocaleDateString('en', { month: 'long', year: 'numeric' })} className="bp-calendar-grid">
        <div role="row" className="bp-calendar-week">{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => <span role="columnheader" key={day}>{day}</span>)}</div>
        {Array.from({ length: 6 }, (_, week) => <div role="row" className="bp-calendar-week" key={week}>{cells.slice(week * 7, week * 7 + 7).map(day => {
          const date = iso(day)
          return <span role="gridcell" key={date} aria-selected={date === selected}><button type="button" data-day={date} data-outside={day.getMonth() !== view.getMonth() || undefined} data-selected={date === selected || undefined}
            aria-current={date === today ? 'date' : undefined} aria-label={day.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            disabled={date < minDay} tabIndex={date === tabDate ? 0 : -1} onFocus={() => setFocused(date)} onKeyDown={event => navigateDay(event, day)} onClick={() => choose(date)}>{day.getDate()}</button></span>
        })}</div>)}
      </div>
      {withTime && <label className="bp-calendar-time">Time<input aria-label={`${label} time`} type="time" value={value.slice(11, 16) || '00:00'} min={selected === minDay ? min?.slice(11, 16) : undefined} onChange={event => {
        if (event.target.value) onChange(`${selected || focused}T${event.target.value}`)
      }} /></label>}
      <div className="bp-calendar-footer"><button type="button" onClick={() => { onChange(''); close() }}>Clear</button><button type="button" disabled={today < minDay} onClick={() => choose(today)}>Today</button><button type="button" onClick={close}>Done</button></div>
    </div>}
  </div>
}
