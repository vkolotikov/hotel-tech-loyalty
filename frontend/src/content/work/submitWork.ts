import { failureOf, type ContentApi } from '../lib/api'
import type { ContentWork, WorkInput } from '../lib/launchTypes'

export interface WorkAttempt { input: WorkInput; id: number | null; sending: boolean; error: string | null; rejected: boolean }
/** Keep the submitted input before transport. A missing/5xx response may have accepted paid work. */
export async function submitWork(api: Pick<ContentApi, 'startWork'>, input: WorkInput, keep: (attempt: WorkAttempt) => void): Promise<ContentWork | null> {
  const attempt = { input, id: null, sending: true, error: null, rejected: false }
  keep(attempt)
  try {
    const { work } = await api.startWork(input)
    keep({ ...attempt, id: work.id, sending: false })
    return work
  } catch (error) {
    const failure = failureOf(error)
    keep({ ...attempt, sending: false, error: failure.code, rejected: failure.status >= 400 && failure.status < 500 && ![408, 409, 429].includes(failure.status) })
    return null
  }
}
