import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi } from './lib/portalApi'
import type { PortalBootstrap } from './lib/types'
import { applyPortalTheme, clearPortalTheme } from './theme/applyPortalTheme'

export interface PortalContextValue {
  data: PortalBootstrap | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

// The shell test and every consumer (vocab.ts, DateTime.tsx) import the
// context and the hook alongside the provider component; splitting them into
// a separate file for fast-refresh's sake would scatter one small module in
// three.
// eslint-disable-next-line react-refresh/only-export-components
export const PortalContext = createContext<PortalContextValue>({
  data: undefined, isLoading: true, isError: false, error: null, refetch: () => {},
})

// eslint-disable-next-line react-refresh/only-export-components
export function usePortal(): PortalContextValue {
  return useContext(PortalContext)
}

const MANIFEST_PORTAL = '/manifest.webmanifest?app=portal'

/**
 * Loads the one bootstrap payload and paints the venue: accent variables on
 * <html>, the document title, the portal's own install manifest. Everything
 * it touches outside React is undone on unmount, so a member signing out
 * into the staff login page gets the admin chrome back.
 */
export function PortalProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const query = useQuery({
    queryKey: ['portal-bootstrap'],
    queryFn: portalApi.bootstrap,
    staleTime: 60_000,
    retry: (count, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status
      return status !== 403 && status !== 401 && count < 2
    },
  })

  useEffect(() => {
    const root = document.documentElement
    const data = query.data
    if (!data) return
    applyPortalTheme(root, { accent: data.venue.accent, display_face: data.venue.display_face })
    const previousTitle = document.title
    document.title = data.venue.name
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const previousManifest = link?.getAttribute('href') ?? null
    link?.setAttribute('href', MANIFEST_PORTAL)
    const serverLanguage = data.member?.user.language
    if (serverLanguage && serverLanguage !== i18n.language && i18n.options.supportedLngs && (i18n.options.supportedLngs as string[]).includes(serverLanguage)) {
      void i18n.changeLanguage(serverLanguage)
    }
    return () => {
      clearPortalTheme(root)
      document.title = previousTitle
      if (link && previousManifest) link.setAttribute('href', previousManifest)
    }
  }, [query.data, i18n])

  return (
    <PortalContext.Provider value={{ data: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error, refetch: () => { void query.refetch() } }}>
      {children}
    </PortalContext.Provider>
  )
}
