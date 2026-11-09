import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { crmApi, failureOf, onWorkspaceOff } from './lib/api'
import { currentBrand, setBrand, settle } from './lib/brand'
import { APP_NAME } from './lib/links'
import type { Bootstrap } from './lib/types'

export interface CrmContextValue {
  data: Bootstrap | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

// The context, its hooks and the provider stay in one small module, like Loyalty's provider.
// eslint-disable-next-line react-refresh/only-export-components
export const CrmContext = createContext<CrmContextValue>({
  data: undefined, isLoading: true, isError: false, error: null, refetch: () => {},
})

// eslint-disable-next-line react-refresh/only-export-components
export function useCrm(): CrmContextValue {
  return useContext(CrmContext)
}

/** The loaded bootstrap. The shell renders a page only once it has one. */
// eslint-disable-next-line react-refresh/only-export-components
export function useBoot(): Bootstrap {
  const { data } = useContext(CrmContext)
  if (!data) throw new Error('useBoot() was called before the CRM bootstrap loaded')
  return data
}

export function CrmProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['crm', 'bootstrap'],
    queryFn: () => crmApi.bootstrap(),
    staleTime: 30_000,
    // The counts beside Inbox, Leads and Tasks stay current while the window is open.
    refetchInterval: 60_000,
    retry: (count, error) => {
      const status = failureOf(error).status
      return status !== 403 && status !== 401 && count < 2
    },
  })

  // The brand chosen on this device may not be this person's (another organisation, a brand taken away): keep what
  // the bootstrap allows and ask again for everything on screen (lib/brand.ts).
  const qc = useQueryClient()
  const boot = query.data
  useEffect(() => {
    if (!boot?.brands) return
    const settled = settle(currentBrand(), boot.brands, boot.all_brands ?? true, boot.brand_id ?? null)
    if (settled !== currentBrand()) {
      setBrand(settled)
      void qc.resetQueries()
    }
  }, [boot, qc])

  // Switched off while this window was open: ask again, so the shell says so instead of a page that stops loading.
  const { refetch } = query
  useEffect(() => onWorkspaceOff(() => { void refetch() }), [refetch])

  useEffect(() => {
    const previous = document.title
    document.title = APP_NAME
    return () => { document.title = previous }
  }, [])

  return (
    <CrmContext.Provider value={{
      data: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error,
      refetch: () => { void query.refetch() },
    }}>
      {children}
    </CrmContext.Provider>
  )
}
