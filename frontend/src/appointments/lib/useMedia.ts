import { useCallback, useSyncExternalStore } from 'react'

/** Whether a media query matches now, and again whenever it changes. False on the server and where there is no matchMedia. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
    const media = window.matchMedia(query)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  const snapshot = useCallback(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    [query],
  )
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
