/** One place the keyboard can stop in the grid: a free slot or an appointment card. */
export interface Stop { key: string; col: number; start: number; end: number }

export const GRID_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'] as const

/** Column by column, top to bottom (ties by key, so the order never depends on rendering). */
export function orderStops(stops: Stop[]): Stop[] {
  return [...stops].sort((a, b) => a.col - b.col || a.start - b.start || a.key.localeCompare(b.key))
}

/** In another column: the stop covering `minute`, else the one starting nearest to it (the earlier on a tie). */
function nearest(column: Stop[], minute: number): Stop {
  return column.find(s => s.start <= minute && minute < s.end)
    ?? column.reduce((best, s) => (Math.abs(s.start - minute) < Math.abs(best.start - minute) ? s : best))
}

/** Where a key moves focus from `from` (Part F); null to stay. Columns with no stop are skipped. */
export function nextStop(stops: Stop[], from: Stop, key: string): Stop | null {
  const column = (c: number) => stops.filter(s => s.col === c)
  const here = column(from.col)
  const index = here.findIndex(s => s.key === from.key)
  switch (key) {
    case 'ArrowDown': return here[index + 1] ?? null
    case 'ArrowUp': return index > 0 ? here[index - 1] : null
    case 'Home': return here[0] ?? null
    case 'End': return here[here.length - 1] ?? null
    case 'ArrowLeft':
    case 'ArrowRight': {
      const step = key === 'ArrowRight' ? 1 : -1
      const last = Math.max(...stops.map(s => s.col))
      for (let c = from.col + step; c >= 0 && c <= last; c += step) {
        const there = column(c)
        if (there.length > 0) return nearest(there, from.start)
      }
      return null
    }
    default: return null
  }
}

/** The grid's one tab stop: the stop last focused, else the open appointment, else the first. */
export function initialStop(stops: Stop[], activeKey: string | null, selectedId: number | null): Stop | null {
  return stops.find(s => s.key === activeKey)
    ?? (selectedId !== null ? stops.find(s => s.key === `appt:${selectedId}`) : undefined)
    ?? stops[0]
    ?? null
}
