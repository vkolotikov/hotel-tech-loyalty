import { describe, expect, it } from 'vitest'
import type { Can } from '../lib/types'
import {
  axisRoom, bandShape, barShare, bucketLong, bucketShort, columnPath, columnWidth, compact, insightsAccess, isEmptyProgramme, labelled,
  linePaths, niceStep, percentText, periodFrom, periodText, quietChoices, quietFrom, scaleFor, searchWith, shareOf,
  splitScale, stackSegments, tierOf,
} from './insightsMath'
import type { Insights } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: false, redeem: false, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })

describe('who sees Insights (spec 2026-10-21 release 2 §3, §5)', () => {
  it('is whoever the bootstrap says may (a manager, or staff with analytics); everyone else sees a notice', () => {
    expect(insightsAccess(can({ view_insights: true }))).toEqual({ view: true })
    expect(insightsAccess(can({ manage_program: true, award: true }))).toEqual({ view: false })
  })
})

describe('the address', () => {
  it('reads the period, 30 days unless it names another of the three', () => {
    expect(periodFrom('')).toBe('30d')
    expect(periodFrom('?period=90d')).toBe('90d')
    expect(periodFrom('?period=12m&quiet=90')).toBe('12m')
    expect(periodFrom('?period=7d')).toBe('30d')
  })

  it('reads the quiet days, 60 unless a whole number from 7 to 365', () => {
    expect(quietFrom('')).toBe(60)
    expect(quietFrom('?quiet=90')).toBe(90)
    expect(quietFrom('?quiet=7')).toBe(7)
    expect(quietFrom('?quiet=6')).toBe(60)
    expect(quietFrom('?quiet=366')).toBe(60)
    expect(quietFrom('?quiet=45.5')).toBe(60)
    expect(quietFrom('?quiet=abc')).toBe(60)
  })

  it('writes a change and leaves the defaults out, keeping the rest', () => {
    expect(searchWith('', { period: '90d' })).toBe('?period=90d')
    expect(searchWith('?period=90d', { period: '30d' })).toBe('')
    expect(searchWith('?period=12m', { quiet: 90 })).toBe('?period=12m&quiet=90')
    expect(searchWith('?quiet=90&period=12m', { quiet: 60 })).toBe('?period=12m')
    expect(searchWith('?brand=x', { period: '90d' })).toBe('?brand=x&period=90d')
  })

  it('offers the usual quiet choices, and the address\'s own number among them', () => {
    expect(quietChoices(60)).toEqual([30, 60, 90, 180, 365])
    expect(quietChoices(45)).toEqual([30, 45, 60, 90, 180, 365])
  })
})

describe('words for days and numbers', () => {
  it('writes a venue day, a week by its Monday and a month without a time zone touching them', () => {
    expect(bucketShort('2026-10-05', 'day', 'en')).toBe('Oct 5')
    expect(bucketShort('2026-09-28', 'week', 'de')).toBe('28. Sept.')
    expect(bucketShort('2026-10', 'month', 'en')).toBe('Oct')
    expect(bucketLong('2026-10-05', 'day', 'en')).toBe('Oct 5, 2026')
    expect(bucketLong('2026-10', 'month', 'fr')).toBe('octobre 2026')
    // The last day of a month stays in its month whatever the browser's zone.
    expect(bucketLong('2026-01-31', 'day', 'en')).toBe('Jan 31, 2026')
  })

  it('writes the period\'s days', () => {
    expect(periodText('2026-09-06', '2026-10-05', 'en')).toBe('Sep 6, 2026 – Oct 5, 2026')
  })

  it('writes axis ticks short from a thousand up, and the rate as the language does', () => {
    expect(compact(250, 'en')).toBe('250')
    expect(compact(1500, 'en')).toBe('1.5K')
    expect(percentText(29.2, 'en')).toBe('29.2%')
    expect(percentText(100, 'en')).toBe('100%')
    expect(percentText(null, 'en')).toBe('—')
  })

  it('shares in whole per cent, and nothing of nothing', () => {
    expect(shareOf(1, 3)).toBe(33)
    expect(shareOf(0, 0)).toBe(0)
  })

  it('names a balance band by its shape', () => {
    expect(bandShape({ min: null, max: -1, members: 1 })).toEqual({ kind: 'below' })
    expect(bandShape({ min: 0, max: 0, members: 1 })).toEqual({ kind: 'zero' })
    expect(bandShape({ min: 501, max: 2000, members: 1 })).toEqual({ kind: 'range', min: 501, max: 2000 })
    expect(bandShape({ min: 10001, max: null, members: 1 })).toEqual({ kind: 'over', min: 10001 })
  })

  it('finds a tier of the ladder by its id', () => {
    const tiers = [{ id: 1, name: 'Silver', color: null, min_points: 0, is_active: false }]
    expect(tierOf(1, tiers)?.name).toBe('Silver')
    expect(tierOf(2, tiers)).toBeNull()
  })

  it('calls a programme without members empty', () => {
    const data = { tiles: { members: 0 } } as Insights
    expect(isEmptyProgramme(data)).toBe(true)
    expect(isEmptyProgramme({ tiles: { members: 1 } } as Insights)).toBe(false)
  })
})

describe('scales', () => {
  it('rounds steps to 1, 2 or 5 times a power of ten, never below 1', () => {
    expect(niceStep(0.3)).toBe(1)
    expect(niceStep(3)).toBe(5)
    expect(niceStep(120)).toBe(200)
    expect(niceStep(514)).toBe(1000)
    expect(niceStep(0)).toBe(1)
  })

  it('runs an axis from 0 to a round value above the largest; all zeros to 1 with one tick', () => {
    expect(scaleFor(1028)).toEqual({ top: 1500, ticks: [0, 500, 1000, 1500] })
    expect(scaleFor(5)).toEqual({ top: 6, ticks: [0, 2, 4, 6] })
    expect(scaleFor(1)).toEqual({ top: 1, ticks: [0, 1] })
    expect(scaleFor(0)).toEqual({ top: 1, ticks: [0] })
  })

  it('splits an axis at zero with one step on both sides', () => {
    expect(splitScale(1028, 300)).toEqual({ up: 2000, down: 1000, upTicks: [0, 1000, 2000], downTicks: [1000] })
    expect(splitScale(40, 0)).toEqual({ up: 40, down: 0, upTicks: [0, 20, 40], downTicks: [] })
    expect(splitScale(0, 30)).toEqual({ up: 0, down: 40, upTicks: [0], downTicks: [20, 40] })
    expect(splitScale(0, 0)).toEqual({ up: 1, down: 0, upTicks: [0], downTicks: [] })
  })
})

describe('columns', () => {
  it('keeps room at the left for the longest axis label, within bounds', () => {
    expect(axisRoom(['0', '1K'])).toBe(24)
    expect(axisRoom(['0', '50.000'])).toBe(52)
    expect(axisRoom([compact(1500, 'ru')])).toBe(66)
    expect(axisRoom(['x'.repeat(40)])).toBe(96)
    expect(axisRoom([])).toBe(24)
  })

  it('takes two thirds of a slot, at most 24 px', () => {
    expect(columnWidth(9)).toBe(5)
    expect(columnWidth(60)).toBe(24)
    expect(columnWidth(1)).toBe(1)
  })

  it('labels as many buckets as fit, counted back from today\'s, which always has one', () => {
    expect(labelled(5, 1000, 50)).toEqual([true, true, true, true, true])
    expect(labelled(30, 280, 56)).toEqual(Array.from({ length: 30 }, (_, i) => (29 - i) % 6 === 0))
    expect(labelled(30, 10, 56).filter(Boolean)).toHaveLength(1)
    expect(labelled(30, 10, 56)[29]).toBe(true)
    expect(labelled(0, 100, 50)).toEqual([])
  })

  it('stacks segments outwards with a 2 px gap between them, leaving out zeros and drawing a negative as nothing', () => {
    expect(stackSegments([10, 0, 5], 2)).toEqual([
      { series: 0, start: 0, size: 18, end: false },
      { series: 2, start: 20, size: 10, end: true },
    ])
    expect(stackSegments([0, 0], 2)).toEqual([])
    expect(stackSegments([-500, 3], 1)).toEqual([{ series: 1, start: 0, size: 3, end: true }])
    // A tiny value under a neighbour still shows.
    expect(stackSegments([1, 1], 1)[0].size).toBe(1)
  })

  it('rounds only the outer end, by up to 4 px', () => {
    expect(columnPath(10, 100, 8, 50, -1, false)).toBe('M10 100H18V50H10Z')
    expect(columnPath(10, 100, 8, 50, -1, true)).toBe('M10 100V54A4 4 0 0 1 14 50H14A4 4 0 0 1 18 54V100Z')
    expect(columnPath(10, 100, 8, 50, 1, true)).toBe('M10 100V146A4 4 0 0 0 14 150H14A4 4 0 0 0 18 146V100Z')
    // Never rounder than the column is wide or long.
    expect(columnPath(0, 10, 4, 1, -1, true)).toBe('M0 10V10A1 1 0 0 1 1 9H3A1 1 0 0 1 4 10V10Z')
  })

  it('draws a line through the points and the area under it to the base', () => {
    expect(linePaths([{ x: 0, y: 10 }, { x: 5, y: 2 }], 20)).toEqual({ line: 'M0 10L5 2', area: 'M0 10L5 2L5 20L0 20Z' })
    expect(linePaths([], 20)).toEqual({ line: '', area: '' })
  })

  it('makes a list bar as long as its share of the longest, at least 1 %', () => {
    expect(barShare(50, 200)).toBe(25)
    expect(barShare(1, 100000)).toBe(1)
    expect(barShare(0, 10)).toBe(0)
    expect(barShare(5, 0)).toBe(0)
  })
})
