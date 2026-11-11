import { QueryClient } from '@tanstack/react-query'

/**
 * Session changes clear this cache before another account can read it. Queries are asked again when the app comes back
 * to the foreground (`focusManager`, fed by AppState in `queries.ts`); a query that must never be asked again on its own
 * (a quote that makes a hold, a payment intent) says `refetchOnWindowFocus: false` itself.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 0, refetchOnWindowFocus: true },
  },
})
