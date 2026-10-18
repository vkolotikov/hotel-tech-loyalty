import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import type { PostDetail } from '../lib/types'
import { postQuery } from './panelQuery'

const client = () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } })

// Final review: a post put in the cache by an answer without its timeline (Create post, Duplicate, Fill with AI, a
// template's Write with AI, a board move) kept "Comments and history" on "Loading…" for as long as the panel was open.
describe('the panel’s read of its post', () => {
  it('reads a post again on opening when the cache holds it without its timeline', async () => {
    const qc = client()
    qc.setQueryData(['content', 3, 'post', 9], { id: 9 } as PostDetail)
    const load = vi.fn().mockResolvedValue({ id: 9, timeline: [] })
    const stop = new QueryObserver(qc, postQuery(3, 9, load)).subscribe(() => {})
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    stop()
  })

  it('does not read a fresh post that has its timeline again on opening', async () => {
    const qc = client()
    qc.setQueryData(['content', 3, 'post', 9], { id: 9, timeline: [] } as unknown as PostDetail)
    const load = vi.fn().mockResolvedValue({ id: 9, timeline: [] })
    const stop = new QueryObserver(qc, postQuery(3, 9, load)).subscribe(() => {})
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(load).not.toHaveBeenCalled()
    stop()
  })
})
