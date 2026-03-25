import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

interface DatePickerProps {
  value: string          // any date string or ''
  onChange: (val: string) => void
  placeholder?: string
  className?: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** Normalize any date string to a Date object, or null if invalid */
function parseDate(val: string): Date | null {
  if (!val) return null
  // If ISO string like "2026-06-01T00:00:00.000Z", extract just the date part
  const dateOnly = val.includes('T') ? val.split('T')[0] : val
  // Try yyyy-mm-dd
  const match = dateOnly.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) {
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    if (!isNaN(d.getTime())) return d
  }
  // Fallback: let JS parse it
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

/** Format Date to yyyy-mm-dd */
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Normalize any date string to yyyy-mm-dd format */
export function normalizeDate(val: string): string {
  if (!val) return ''
  const d = parseDate(val)
  return d ? fmt(d) : val
}

export function DatePicker({ value, onChange, placeholder = 'Select date', className = '' }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const today = new Date()
  const selected = parseDate(value)
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth())

  // Calculate popup position when opening
  const calcPosition = useCallback(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const popupWidth = 280
    const popupHeight = 320
    // Right-align if popup would overflow viewport right edge
    setAlignRight(rect.left + popupWidth > window.innerWidth - 16)
    // Open upward if popup would overflow viewport bottom
    setOpenUpward(rect.bottom + popupHeight > window.innerHeight - 16)
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Sync view when value changes externally
  useEffect(() => {
    if (selected) {
      setViewYear(selected.getFullYear())
      setViewMonth(selected.getMonth())
    }
  }, [value])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate()

  const cells: { day: number; current: boolean; date: Date }[] = []

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i
    cells.push({ day: d, current: false, date: new Date(viewYear, viewMonth - 1, d) })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, date: new Date(viewYear, viewMonth, d) })
  }
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, current: false, date: new Date(viewYear, viewMonth + 1, d) })
  }

  const isToday = (d: Date) => fmt(d) === fmt(today)
  const isSelected = (d: Date) => selected ? fmt(d) === fmt(selected) : false

  const displayValue = selected
    ? `${MONTHS[selected.getMonth()]} ${selected.getDate()}, ${selected.getFullYear()}`
    : ''

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { if (!open) calcPosition(); setOpen(!open) }}
        className="w-full flex items-center gap-2 bg-[#1e1e1e] border border-[#2e2e50] rounded-lg px-3 py-2 text-sm text-left hover:border-[#6366f1]/50 transition-colors focus:outline-none focus:ring-2 focus:ring-[#6366f1]/40"
      >
        <Calendar size={15} className="text-[#6366f1] flex-shrink-0" />
        <span className={displayValue ? 'text-white flex-1' : 'text-[#4b5563] flex-1'}>{displayValue || placeholder}</span>
        {value && (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false) }}
            className="text-[#4b5563] hover:text-[#ef4444] transition-colors text-xs cursor-pointer"
          >
            &times;
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute z-50 w-[280px] bg-[#1a1a2e] border border-[#2e2e50] rounded-xl shadow-2xl shadow-black/50 p-3 ${alignRight ? 'right-0' : 'left-0'} ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[#222240] text-[#9ca3af] hover:text-white transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-white">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#222240] text-[#9ca3af] hover:text-white transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-[#4b5563] py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((cell, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { onChange(fmt(cell.date)); setOpen(false) }}
                className={`
                  h-8 w-8 mx-auto rounded-lg text-xs font-medium transition-all
                  flex items-center justify-center
                  ${!cell.current ? 'text-[#3a3a5c]' : 'text-[#9ca3af] hover:bg-[#222240] hover:text-white'}
                  ${isToday(cell.date) && !isSelected(cell.date) ? 'ring-1 ring-[#6366f1]/40 text-[#6366f1]' : ''}
                  ${isSelected(cell.date) ? 'bg-[#6366f1] text-white hover:bg-[#6366f1]' : ''}
                `}
              >
                {cell.day}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2e2e50]">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className="text-xs text-[#4b5563] hover:text-white transition-colors px-2 py-1"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => { onChange(fmt(today)); setOpen(false) }}
              className="text-xs text-[#6366f1] hover:text-[#818cf8] transition-colors font-medium px-2 py-1"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
