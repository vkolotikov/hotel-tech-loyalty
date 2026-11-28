import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi, useBrandId } from '../ContentProvider'
import { useRetainedState } from '../drafts/useRetainedState'
import { failureOf } from '../lib/api'
import { workActive, type ContentWork, type WorkInput } from '../lib/launchTypes'
import { usePanel } from '../panel/PanelProvider'
import { submitWork, type WorkAttempt } from './submitWork'

/** One work slot survives route/panel changes. An unanswered POST keeps its exact key AND input. */
export function useContentWork(name: string, postId: number | null, onSuccess: (work: ContentWork) => void) {
  const api = useApi(), brand = useBrandId(), panel = usePanel(), client = useQueryClient()
  const [attempt, setAttempt] = useRetainedState<WorkAttempt | null>(`work:${name}`, null, false)
  const [error, setError] = useRetainedState<string | null>(`work-error:${name}`, null, false)
  const applied = useRef<number | null>(null)
  const origin = useRef<(() => boolean) | null>(null)
  const success = useRef(onSuccess)
  useEffect(() => { success.current = onSuccess }, [onSuccess])
  const key = ['content', brand, 'work', name, attempt?.id ? `run:${attempt.id}` : 'latest']
  const query = useQuery({ queryKey: key, queryFn: () => attempt?.id ? api.work(attempt.id) : api.postWork(postId!),
    enabled: Boolean(attempt?.id || (!attempt && postId)), refetchInterval: q => workActive(q.state.data?.work) ? 1500 : false, staleTime: 0, retry: false })
  const work = attempt && !attempt.id ? null : query.data?.work ?? null
  useEffect(() => {
    if (work?.status !== 'succeeded' || applied.current === work.id) return
    applied.current = work.id
    // Post adoption rebases against this post's current draft. A recovered Fill never steals a later editor.
    if (origin.current ? origin.current() : postId !== null) success.current(work)
  }, [work, postId])
  const submit = async (input: WorkInput) => {
    origin.current = panel.capture()
    setError(null)
    const answer = await submitWork(api, input, setAttempt)
    if (answer) client.setQueryData(['content', brand, 'work', name, `run:${answer.id}`], { work: answer })
  }
  const start = (input: Omit<WorkInput, 'request_key'>) => submit({ ...input, request_key: crypto.randomUUID() })
  const reconnect = () => attempt && !attempt.id && !attempt.rejected ? submit(attempt.input) : query.refetch()
  const retry = () => attempt ? start({ ...attempt.input }) : undefined
  const cancel = async () => {
    if (!work?.can_cancel) return
    try { const answer = await api.cancelWork(work.id); client.setQueryData(key, answer) }
    catch (e) { setError(failureOf(e).code) }
  }
  return { work, action: work?.action ?? attempt?.input.action, error: error ?? attempt?.error ?? (query.isError ? failureOf(query.error).code : null), starting: Boolean(attempt?.sending),
    busy: Boolean(attempt?.sending) || workActive(work), uncertain: Boolean(attempt && !attempt.id && !attempt.rejected), rejected: Boolean(attempt?.rejected), start, reconnect, retry, cancel, canRetry: Boolean(attempt) }
}
