import { useCallback, useState, useSyncExternalStore, type SetStateAction } from 'react'
import { useBrandId } from '../ContentProvider'
import { ownerOf } from '../panel/kept'
import { contentDrafts } from './registry'

/** Shared by Brand sections, list editors and the post controller. Internal navigation keeps the exact draft. */
export function useRetainedState<T>(name: string, initial: T | (() => T), tracked = true) {
  const owner = ownerOf(useBrandId())
  const key = `${owner}::${name}`
  // SSR owns no tab memory: each render/request gets its own initial snapshot.
  const [serverValue] = useState(initial)
  const read = () => contentDrafts.read<T>(key, () => typeof initial === 'function' ? (initial as () => T)() : initial)
  const value = useSyncExternalStore(contentDrafts.subscribe, read, () => serverValue)
  const ticket = contentDrafts.ticket(key)
  const set = useCallback((next: SetStateAction<T>) => {
    if (!contentDrafts.owns(key, ticket)) return
    const previous = contentDrafts.read<T>(key, () => typeof initial === 'function' ? (initial as () => T)() : initial)
    contentDrafts.write(key, typeof next === 'function' ? (next as (old: T) => T)(previous) : next, tracked)
  }, [key, ticket, initial, tracked])
  const adoptIfClean = useCallback((authoritative: T) => {
    if (contentDrafts.owns(key, ticket)) contentDrafts.adoptIfClean(key, authoritative)
  }, [key, ticket])
  return [value, set, {
    adoptIfClean,
    current: read,
    acknowledge: (submitted: T) => {
      if (!contentDrafts.owns(key, ticket)) return false
      contentDrafts.acknowledge(key, submitted)
      return true
    },
    clear: () => { if (contentDrafts.owns(key, ticket)) contentDrafts.remove(key) },
  }] as const
}
