import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { appointmentsApi, onWorkspaceOff } from './lib/api'
import { APP_NAME } from './lib/constants'
import type { Bootstrap } from './lib/types'

export interface AppointmentsContextValue {
  data: Bootstrap | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

// The context, its hooks and the provider stay in one small module, like the
// portal's provider.
// eslint-disable-next-line react-refresh/only-export-components
export const AppointmentsContext = createContext<AppointmentsContextValue>({
  data: undefined, isLoading: true, isError: false, error: null, refetch: () => {},
})

// eslint-disable-next-line react-refresh/only-export-components
export function useAppointments(): AppointmentsContextValue {
  return useContext(AppointmentsContext)
}

/** The loaded bootstrap. The shell renders a page only once it has one. */
// eslint-disable-next-line react-refresh/only-export-components
export function useBoot(): Bootstrap {
  const { data } = useContext(AppointmentsContext)
  if (!data) throw new Error('useBoot() was called before the workspace bootstrap loaded')
  return data
}

export function AppointmentsProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['appointments', 'bootstrap'],
    queryFn: appointmentsApi.bootstrap,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: (count, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      return status !== 403 && status !== 401 && count < 2
    },
  })

  // Switched off while this window was open: ask again, so the shell says so
  // (and offers the full admin) instead of a page that merely stops loading.
  const { refetch } = query
  useEffect(() => onWorkspaceOff(() => { void refetch() }), [refetch])

  useEffect(() => {
    const previous = document.title
    document.title = APP_NAME
    return () => { document.title = previous }
  }, [])

  return (
    <AppointmentsContext.Provider value={{
      data: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error,
      refetch: () => { void query.refetch() },
    }}>
      {children}
    </AppointmentsContext.Provider>
  )
}
