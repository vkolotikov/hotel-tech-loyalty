export interface ScheduleRow { day_of_week: number; start_time: string; end_time: string }

/**
 * The full admin's schedule form shows one window per weekday. An edit
 * changes that window only: a second window of the same day (a split day
 * set in HexaTech Appointments) is kept as it is, instead of being given
 * the same times and refused as an overlap.
 */
export function editFirstWindow<T extends ScheduleRow>(rows: T[], dayOfWeek: number, field: 'start_time' | 'end_time', value: string): T[] {
  const index = rows.findIndex(r => r.day_of_week === dayOfWeek)
  return rows.map((r, i) => (i === index ? { ...r, [field]: value } : r))
}

/** "Failed to save schedule", with the server's reason when it gave one (a 422 names the hours it refused). */
export function scheduleSaveError(error: unknown): string {
  const message = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message
  return typeof message === 'string' && message !== '' ? `Failed to save schedule: ${message}` : 'Failed to save schedule'
}
