import { QueryClient } from '@tanstack/react-query'

/** Session changes clear this cache before another account can read it. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 0, refetchOnWindowFocus: false },
  },
})
