import { useQuery } from '@tanstack/react-query'
import { api } from './api'

/** The venue's "email clients about staff changes" setting, from GET /v1/admin/settings (rows grouped by group). */
export function staffDefaultFrom(answer: unknown): boolean {
  const groups = (answer as { settings?: Record<string, { key: string; value: unknown }[]> } | undefined)?.settings
  if (!groups || typeof groups !== 'object') return false
  for (const rows of Object.values(groups)) {
    const row = Array.isArray(rows) ? rows.find(r => r?.key === 'client_messages_staff_default') : undefined
    if (row) return row.value === true || row.value === 'true' || row.value === 1 || row.value === '1'
  }
  return false
}

/** What to send as notify_client: the box when it is shown; "do not tell" when the screen said nobody will be told. */
export function notifyFor(email: string | null | undefined, tell: boolean): boolean {
  return !!email?.trim() && tell
}

/** Whether a status change tells the client — as the server decides: confirmed from pending; cancelled from pending, confirmed or in progress. */
export function statusTells(from: string, to: string): boolean {
  if (from === to) return false
  if (to === 'confirmed') return from === 'pending'
  if (to === 'cancelled') return ['pending', 'confirmed', 'in_progress'].includes(from)
  return false
}

/** Whether "Tell the client" starts ticked in the full admin; false until the settings answer. */
export function useTellClientDefault(): boolean {
  const { data } = useQuery({
    queryKey: ['client-messages-default'],
    queryFn: () => api.get('/v1/admin/settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  return staffDefaultFrom(data)
}
