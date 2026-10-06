/** The lengths staff may set for one appointment (Part F): 15 minutes to 8 hours, in 15-minute steps — the server's own rule. */
export const LENGTH_STEP = 15
export const LENGTH_MAX = 480

export function lengthChoices(): number[] {
  return Array.from({ length: LENGTH_MAX / LENGTH_STEP }, (_, i) => (i + 1) * LENGTH_STEP)
}

/** "45 min", "1 h", "1 h 30 min" — the key, its English fallback and its values. */
export function lengthLabel(minutes: number): { key: string; fallback: string; vars: Record<string, number> } {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return { key: 'appointments.panel.length_min', fallback: '{{m}} min', vars: { m } }
  if (m === 0) return { key: 'appointments.panel.length_h', fallback: '{{h}} h', vars: { h } }
  return { key: 'appointments.panel.length_h_min', fallback: '{{h}} h {{m}} min', vars: { h, m } }
}

/** A chosen length, or the person's normal one. */
export type LengthChoice = number | 'normal'

/** What the move request carries: a length; `normal_length` to forget the staff-set one; nothing to keep it. */
export function lengthBody(choice: LengthChoice, setByStaff: boolean): { length?: number; normal_length?: boolean } {
  if (choice === 'normal') return setByStaff ? { normal_length: true } : {}
  return { length: choice }
}
