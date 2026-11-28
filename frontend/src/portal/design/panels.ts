import { createContext, useContext } from 'react'

export type PortalPanel = 'card' | 'earn' | 'invite' | 'activity' | 'codes' | 'updates' | null
export const PortalPanelsContext = createContext<{ open: (panel: PortalPanel) => void }>({ open: () => {} })
export const usePortalPanels = () => useContext(PortalPanelsContext)
