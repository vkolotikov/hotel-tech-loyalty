import type { PanelTab } from './panelMath'

/**
 * What the post panel remembers on this device (spec 2026-10-21 §7.3, §7.4): the tab last open and which folding
 * sections are open. Storage may be missing or refuse (a private window, a test): then nothing is remembered.
 */
const TAB = 'content:panel-tab'
const fold = (id: string) => `content:fold:${id}`

export function loadPanelTab(): PanelTab {
  try {
    const value = localStorage.getItem(TAB)
    return value === 'ai' || value === 'activity' ? value : 'content'
  } catch {
    return 'content'
  }
}

export function savePanelTab(tab: PanelTab): void {
  try { localStorage.setItem(TAB, tab) } catch { /* not remembered */ }
}

export function loadFold(id: string): boolean {
  try {
    return localStorage.getItem(fold(id)) === '1'
  } catch {
    return false
  }
}

export function saveFold(id: string, open: boolean): void {
  try { localStorage.setItem(fold(id), open ? '1' : '0') } catch { /* not remembered */ }
}
