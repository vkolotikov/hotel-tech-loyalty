import { createContext, useContext } from 'react'
import type { LiveLook } from '../../workspace/lib/look'

/** Settings edits the same live preference state that paints the frame. */
export const OverviewLookContext = createContext<LiveLook | null>(null)
export function useOverviewLook(): LiveLook {
  const look = useContext(OverviewLookContext)
  if (!look) throw new Error('Settings requires the Loyalty frame')
  return look
}
