import { queryOptions } from '@tanstack/react-query'
import type { PostDetail } from '../lib/types'
import { pollsWhileRewording } from './repeatMath'

/**
 * The panel's read of its post (`GET posts/{id}`, which carries the timeline). A post put in the cache by an answer
 * without its timeline — Create post, Duplicate, Fill with AI, a template's Write with AI, a board move — is read again
 * on opening (final review: "Comments and history" otherwise stayed on "Loading…"). While the AI rewords the post's
 * series it is read every 5 s (spec 2026-10-15 §8); otherwise the panel does not poll.
 */
export const postQuery = (brand: number | null, id: number | null, load: () => Promise<PostDetail>) => queryOptions({
  queryKey: ['content', brand, 'post', id],
  queryFn: load,
  enabled: id !== null,
  staleTime: (query) => (query.state.data?.timeline === undefined ? 0 : 30_000),
  refetchInterval: (query) => (pollsWhileRewording(query.state.data) ? 5_000 : false),
})
