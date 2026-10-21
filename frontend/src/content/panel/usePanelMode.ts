import { useMedia } from '../../workspace/lib/useMedia'
import type { PanelMode } from './panelMath'

/** Where the post panel sits now (spec 2026-10-21 §7.1), following the window's width. */
export function usePanelMode(): PanelMode {
  const docked = useMedia('(min-width: 1280px)')
  const over = useMedia('(min-width: 640px)')
  return docked ? 'docked' : over ? 'over' : 'full'
}
