import { useQuery } from '@tanstack/react-query'
import { useApi, useBrandId } from '../ContentProvider'
import { errorKey } from '../lib/errors'
import type { GenerateResult, GenerateRun } from '../lib/types'

/**
 * Generate on the queue (2026-10-20): production cuts a request off at 60 s and a week of posts takes longer, so the run
 * is a job on the queue worker. The dialog and the Plan follow it through one shared query, read every 4 s while it runs.
 */
export const GENERATE_POLL_MS = 4000

export const isRunning = (run: GenerateRun | undefined): boolean => run?.status === 'running'

/** A run seen running that is now a result: read the plan again and say how it went. */
export const runEnded = (prev: GenerateRun | undefined, next: GenerateRun | undefined): next is GenerateResult =>
  isRunning(prev) && next !== undefined && next.status !== 'running' && next.status !== 'idle'

type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

/** The Plan's note when a run ends: the posts written, why it stopped, or that nothing was written. */
export function runNote(run: GenerateResult, t: Translate): { tone: 'info' | 'danger'; text: string } {
  if (run.created_count > 0) return { tone: 'info', text: t('content.generate.done', 'Posts written: {{count}}', { count: run.created_count }) }
  if (run.error) {
    const [key, text] = errorKey('generate', run.error)
    return { tone: 'danger', text: t(key, text) }
  }
  return { tone: 'danger', text: t('content.generate.none', 'No posts were written.') }
}

/** Why a run stopped before it could write (its `error`), in the refusal's words; null for a run that reported. */
export function runWhy(run: GenerateResult, t: Translate): string | null {
  if (!run.error) return null
  const [key, text] = errorKey('generate', run.error)
  return t(key, text)
}

/** The brand's run, shared by the dialog and the Plan; read every 4 s while it runs, else once. */
export function useGenerationRun() {
  const api = useApi()
  const brand = useBrandId()
  return useQuery({
    queryKey: ['content', brand, 'generation'],
    queryFn: api.generation,
    refetchInterval: (query) => (isRunning(query.state.data as GenerateRun | undefined) ? GENERATE_POLL_MS : false),
  })
}
