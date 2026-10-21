import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { failureOf, loyaltyApi, onWorkspaceOff, type LoyaltyApi } from './lib/api'
import { APP_NAME } from './lib/links'
import type { Bootstrap } from './lib/types'

export interface LoyaltyContextValue {
  data: Bootstrap | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

// The context, its hooks and the provider stay in one small module, like Content's provider.
// eslint-disable-next-line react-refresh/only-export-components
export const LoyaltyContext = createContext<LoyaltyContextValue>({
  data: undefined, isLoading: true, isError: false, error: null, refetch: () => {},
})

// eslint-disable-next-line react-refresh/only-export-components
export function useLoyalty(): LoyaltyContextValue {
  return useContext(LoyaltyContext)
}

/** The loaded bootstrap. The shell renders a page only once it has one. */
// eslint-disable-next-line react-refresh/only-export-components
export function useBoot(): Bootstrap {
  const { data } = useContext(LoyaltyContext)
  if (!data) throw new Error('useBoot() was called before the Loyalty bootstrap loaded')
  return data
}

/** The calls (one set: the programme is the organisation's, not a brand's). */
// eslint-disable-next-line react-refresh/only-export-components
export function useApi(): LoyaltyApi {
  return loyaltyApi
}

export function LoyaltyProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['loyalty', 'bootstrap'],
    queryFn: () => loyaltyApi.bootstrap(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: (count, error) => {
      const status = failureOf(error).status
      return status !== 403 && status !== 401 && count < 2
    },
  })

  // Switched off while this window was open: ask again, so the shell says so instead of a page that stops loading.
  const { refetch } = query
  useEffect(() => onWorkspaceOff(() => { void refetch() }), [refetch])

  useEffect(() => {
    const previous = document.title
    document.title = APP_NAME
    return () => { document.title = previous }
  }, [])

  return (
    <LoyaltyContext.Provider value={{
      data: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error,
      refetch: () => { void query.refetch() },
    }}>
      {children}
    </LoyaltyContext.Provider>
  )
}
