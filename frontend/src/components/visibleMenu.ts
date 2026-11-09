import { createContext, useContext } from 'react'
import type { VisibleNavGroup } from './Layout'

/**
 * The menu as this person sees it, for pages that offer the same ways in (the dashboard's Workspaces card): one
 * filtering, the side panel's (Layout.tsx provides it around every page), so a page never offers what the menu hides.
 * Null outside the full admin's frame.
 */
export const VisibleMenuContext = createContext<VisibleNavGroup[] | null>(null)

export function useVisibleMenu(): VisibleNavGroup[] | null {
  return useContext(VisibleMenuContext)
}
