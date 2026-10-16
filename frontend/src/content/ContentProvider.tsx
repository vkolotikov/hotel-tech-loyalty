import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { contentApi, failureOf, onWorkspaceOff, type ContentApi } from './lib/api'
import { deviceStorage, firstBrand, loadBootstrap, rememberBrand } from './lib/brand'
import { APP_NAME } from './lib/constants'
import type { Bootstrap } from './lib/types'

export interface ContentContextValue {
  data: Bootstrap | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  /** Work on another brand from now on. The caller has already asked about unsaved edits. */
  switchBrand: (id: number) => void
}

// The context, its hooks and the provider stay in one small module, like Appointments' provider.
// eslint-disable-next-line react-refresh/only-export-components
export const ContentContext = createContext<ContentContextValue>({
  data: undefined, isLoading: true, isError: false, error: null, refetch: () => {}, switchBrand: () => {},
})

// eslint-disable-next-line react-refresh/only-export-components
export function useContent(): ContentContextValue {
  return useContext(ContentContext)
}

/** The loaded bootstrap. The shell renders a page only once it has one. */
// eslint-disable-next-line react-refresh/only-export-components
export function useBoot(): Bootstrap {
  const { data } = useContext(ContentContext)
  if (!data) throw new Error('useBoot() was called before the Content bootstrap loaded')
  return data
}

/** The brand every call works on: the start of every query key after 'content'. */
// eslint-disable-next-line react-refresh/only-export-components
export function useBrandId(): number | null {
  // Null, not a throw, before the bootstrap: the panel's provider reads it while the portal is still loading.
  return useContext(ContentContext).data?.brand?.id ?? null
}

/** The calls, for the brand the portal works on. */
// eslint-disable-next-line react-refresh/only-export-components
export function useApi(): ContentApi {
  const brand = useBrandId()
  return useMemo(() => contentApi(brand), [brand])
}

export function ContentProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // The brand to ask for: this device's last one here, else the full admin's choice, else the person's default (spec §6.7).
  // A shared post link names its brand; otherwise this device's own choice (a brand the person may not use falls back
  // to their default in loadBootstrap, and the post then reads "not found").
  const [asked, setAsked] = useState<number | null>(() => firstBrand(typeof window === 'undefined' ? '' : window.location.search, deviceStorage()))
  const query = useQuery({
    queryKey: ['content', 'bootstrap', asked],
    queryFn: () => loadBootstrap(asked, deviceStorage(), brand => contentApi(brand).bootstrap()),
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

  // The brand the server works on is the one this device asks for next time.
  const brandId = query.data?.brand?.id ?? null
  useEffect(() => { if (brandId !== null) rememberBrand(deviceStorage(), brandId) }, [brandId])

  useEffect(() => {
    const previous = document.title
    document.title = APP_NAME
    return () => { document.title = previous }
  }, [])

  const switchBrand = useCallback((id: number) => {
    rememberBrand(deviceStorage(), id)
    // Nothing of one brand may show under the next.
    queryClient.removeQueries({ predicate: q => q.queryKey[0] === 'content' && q.queryKey[1] !== 'bootstrap' })
    setAsked(id)
  }, [queryClient])

  return (
    <ContentContext.Provider value={{
      data: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error,
      refetch: () => { void query.refetch() }, switchBrand,
    }}>
      {children}
    </ContentContext.Provider>
  )
}
