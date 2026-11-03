import { create } from 'zustand'
import type { ScanAnswer } from './types'

export type ScanWhere = { kind: 'desk' } | { kind: 'place'; id: number; name: string } | { kind: 'event'; id: number; name: string }
export function whereKey(where: ScanWhere): string {
  return where.kind === 'desk' ? 'desk' : `${where.kind}:${where.id}`
}
interface ScanState {
  where: ScanWhere
  answer: ScanAnswer | null
  setWhere: (where: ScanWhere) => void
  show: (answer: ScanAnswer) => void
  reset: () => void
}
export const useScan = create<ScanState>(set => ({
  where: { kind: 'desk' }, answer: null,
  setWhere: where => set({ where }),
  show: answer => set({ answer }),
  reset: () => set({ where: { kind: 'desk' }, answer: null }),
}))
