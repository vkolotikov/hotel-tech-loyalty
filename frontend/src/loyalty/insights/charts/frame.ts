import type { BucketKind } from '../types'

/** A series' colour slot (theme/insights.css): fixed per series, never by rank. */
export type Tone = 1 | 2 | 3

export interface Series {
  name: string
  tone: Tone
  values: number[]
}

/** The room a chart keeps around its plot: the x-axis labels below (the y-axis labels' room is measured, insightsMath `axisRoom`). */
export const MARGIN = { top: 12, right: 6, bottom: 24 }

/** How wide an x-axis label is taken to be when deciding how many fit: "22 Sep" at 12 px, or "Sep". */
export function labelWidth(kind: BucketKind): number {
  return kind === 'month' ? 40 : 56
}
