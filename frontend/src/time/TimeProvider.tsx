import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { failureOf, onWorkspaceOff, timeApi } from './lib/api'
import { APP_NAME } from './lib/links'
import type { Bootstrap } from './lib/types'

export interface TimeContextValue {
  data: Bootstrap | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

// The context, its hooks and the provider stay in one small module, like the CRM's provider.
// eslint-disable-next-line react-refresh/only-export-components
export const TimeContext = createContext<TimeContextValue>({
  data: undefined, isLoading: true, isError: false, error: null, refetch: () => {},
})

// eslint-disable-next-line react-refresh/only-export-components
export function useTime(): TimeContextValue {
  return useContext(TimeContext)
}

/** The loaded bootstrap. The shell renders a page only once it has one. */
// eslint-disable-next-line react-refresh/only-export-components
export function useBoot(): Bootstrap {
  const { data } = useContext(TimeContext)
  if (!data) throw new Error('useBoot() was called before the Time Planner bootstrap loaded')
  return data
}

export function TimeProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['time', 'bootstrap'],
    queryFn: () => timeApi.bootstrap(),
    staleTime: 30_000,
    // The counts beside My day and the backlog stay current while the window is open.
    refetchInterval: 60_000,
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
    <TimeContext.Provider value={{
      data: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error,
      refetch: () => { void query.refetch() },
    }}>
      {children}
    </TimeContext.Provider>
  )
}
