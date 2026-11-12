import { describe, expect, it } from 'vitest'
import {
  barShare, bucketLabel, busiestHour, busiestWeekday, changeTone, countChange, countryName, dayBuckets, dealTotals, forecastColumns, funnelRows, hourRows, intentRows, labelled, lengthRows, lostReasonRows, monthLabel, monthsOf, ownerDays, paymentRows, periodOf, pickPipeline, pipelineSummary, rate, rateChange, refusedForRights, sectionOf, serverChange, shortDay, shortPath, signalName, stageRows, statusRows, trendBuckets, weekdayName, weekdayRows, windows, zoneLabel,
} from './insightsMath'
import type { ChatTrendPoint, Pipeline } from './types'

const point = (date: string, count: number, ai = 0): ChatTrendPoint => ({ date, count, engagedCount: count, aiResolved: ai, aiResolutionRate: 0, prevCount: 0 })

describe('the period', () => {
  it('reads 7, 30 or 90 days from the address, else 30', () => {
    expect(periodOf('7')).toBe(7)
    expect(periodOf('90')).toBe(90)
    expect(periodOf('14')).toBe(30)
    expect(periodOf(null)).toBe(30)
  })

  it('counts the venue’s days: today and the days before it, and the window just before that', () => {
    // 23:30 in Riga on 7 November is 21:30 UTC: the 7th either way.
    const now = new Date('2026-11-07T21:30:00Z')
    expect(windows(7, now, 'Europe/Riga')).toEqual({ from: '2026-11-01', prevFrom: '2026-10-25', prevTo: '2026-10-31' })
    expect(windows(30, now, 'Europe/Riga')).toEqual({ from: '2026-10-09', prevFrom: '2026-09-09', prevTo: '2026-10-08' })
    // 00:30 in Riga on 8 November is still the 7th in UTC: the venue's day decides.
    expect(windows(7, new Date('2026-11-07T22:30:00Z'), 'Europe/Riga').from).toBe('2026-11-02')
    expect(windows(7, new Date('2026-11-07T22:30:00Z')).from).toBe('2026-11-01')
    expect(windows(30, new Date('2026-03-01T00:05:00Z')).from).toBe('2026-01-31')
  })
})

describe('changes against the period before', () => {
  it('compares counts in whole percent, and says new when there was nothing before', () => {
    expect(countChange(12, 10)).toEqual({ kind: 'up', amount: 20, unit: 'percent' })
    expect(countChange(5, 10)).toEqual({ kind: 'down', amount: 50, unit: 'percent' })
    expect(countChange(10, 10)).toEqual({ kind: 'same', amount: 0, unit: 'percent' })
    expect(countChange(3, 0)).toEqual({ kind: 'new' })
    expect(countChange(0, 0)).toBeNull()
  })

  it('compares rates in points, only when the period before had something to rate', () => {
    expect(rateChange(45.5, 40, 20)).toEqual({ kind: 'up', amount: 5.5, unit: 'points' })
    expect(rateChange(30, 40.25, 20)).toEqual({ kind: 'down', amount: 10.3, unit: 'points' })
    expect(rateChange(30, 0, 0)).toBeNull()
  })

  it('reads a change the server worked out, and its tone', () => {
    expect(serverChange(-12.4)).toEqual({ kind: 'down', amount: 12, unit: 'percent' })
    expect(serverChange(null)).toBeNull()
    expect(changeTone(countChange(12, 10), true)).toBe('good')
    expect(changeTone(countChange(8, 10), true)).toBe('bad')
    expect(changeTone(countChange(8, 10), null)).toBe('plain')
    expect(changeTone({ kind: 'new' }, true)).toBe('plain')
    expect(changeTone(null, true)).toBe('plain')
  })
})

describe('the conversations chart', () => {
  it('keeps a day per column up to a month', () => {
    const trend = [point('2026-11-01', 3, 1), point('2026-11-02', 0)]
    expect(trendBuckets(trend)).toEqual([
      { key: '2026-11-01', from: '2026-11-01', to: '2026-11-01', total: 3, ai: 1 },
      { key: '2026-11-02', from: '2026-11-02', to: '2026-11-02', total: 0, ai: 0 },
    ])
  })

  it('groups 90 days into weeks counted back from today, the latest week whole', () => {
    const trend = Array.from({ length: 90 }, (_, i) => point(new Date(Date.UTC(2026, 7, 10 + i)).toISOString().slice(0, 10), 1, i % 2))
    const weeks = trendBuckets(trend)
    expect(weeks).toHaveLength(13)
    expect(weeks[12]).toMatchObject({ from: trend[83].date, to: trend[89].date, total: 7 })
    expect(weeks[0]).toMatchObject({ from: trend[0].date, to: trend[5].date, total: 6 })
    expect(weeks.reduce((n, w) => n + w.total, 0)).toBe(90)
    expect(weeks.reduce((n, w) => n + w.ai, 0)).toBe(45)
  })

  it('labels a UTC day and a week, and at most seven columns with the latest always', () => {
    expect(shortDay('2026-11-04', 'en-GB')).toBe('4 Nov')
    expect(shortDay('nope', 'en')).toBe('nope')
    expect(bucketLabel({ from: '2026-11-01', to: '2026-11-07' }, 'en-GB')).toBe('1 Nov – 7 Nov')
    const thirty = labelled(30)
    expect(thirty.filter(Boolean).length).toBeLessThanOrEqual(7)
    expect(thirty[29]).toBe(true)
    expect(labelled(7).every(Boolean)).toBe(true)
  })

  it('sizes bars against the longest, keeping a small one visible', () => {
    expect(barShare(50, 100)).toBe(50)
    expect(barShare(1, 1000)).toBe(2)
    expect(barShare(0, 10)).toBe(0)
    expect(barShare(5, 0)).toBe(0)
  })
})

describe('the chat’s breakdowns', () => {
  it('orders the states we have words for first, drops empty ones, and takes the empty answer PHP sends', () => {
    expect(statusRows({ resolved: 4, spam: 2, waiting: 1, active: 0 })).toEqual([
      { key: 'waiting', count: 1, known: true },
      { key: 'resolved', count: 4, known: true },
      { key: 'spam', count: 2, known: false },
    ])
    expect(statusRows([])).toEqual([])
  })

  it('shortens a page to its path and names a country code', () => {
    expect(shortPath('https://hotel.lv/rooms/suite?lang=de')).toBe('/rooms/suite?lang=de')
    expect(shortPath('https://hotel.lv')).toBe('/')
    expect(shortPath('not a url')).toBe('not a url')
    expect(shortPath(`https://x.io/${'a'.repeat(80)}`)).toHaveLength(48)
    expect(countryName('lv', 'en')).toBe('Latvia')
    expect(countryName('Latvia', 'en')).toBe('Latvia')
  })

  it('gives each funnel step its share of the conversations', () => {
    expect(funnelRows([{ stage: 'conversations', count: 200 }, { stage: 'engaged', count: 120 }, { stage: 'lead_captured', count: 9 }]))
      .toEqual([{ stage: 'conversations', count: 200, share: 100 }, { stage: 'engaged', count: 120, share: 60 }, { stage: 'lead_captured', count: 9, share: 5 }])
    expect(funnelRows([{ stage: 'conversations', count: 0 }])[0].share).toBeNull()
  })

  it('fills all 24 hours and finds the busiest', () => {
    const rows = hourRows([{ hour: 9, label: '09:00', conversations: 4, visitors: 3, replies: 9 }, { hour: 14, label: '14:00', conversations: 6, visitors: 5, replies: 2 }])
    expect(rows).toHaveLength(24)
    expect(rows[9]).toEqual({ hour: 9, label: '09', count: 4 })
    expect(rows[0].count).toBe(0)
    expect(busiestHour(rows)).toBe(14)
    expect(busiestHour(hourRows([]))).toBeNull()
  })
})

describe('the pipeline', () => {
  const pipeline = (id: number, isDefault: boolean): Pipeline => ({
    id, name: `P${id}`, is_default: isDefault, sort_order: id, inquiries_count: 15,
    stages: [
      { id: 3, name: 'Won', kind: 'won', sort_order: 3, inquiries_count: 3 },
      { id: 1, name: 'New', kind: 'open', sort_order: 1, inquiries_count: 8 },
      { id: 4, name: 'Lost', kind: 'lost', sort_order: 4, inquiries_count: 1 },
      { id: 2, name: 'Offer', kind: 'open', sort_order: 2, inquiries_count: 3 },
    ],
  })

  it('shows the pipeline asked for, else the default, else the first', () => {
    const list = [pipeline(1, false), pipeline(2, true)]
    expect(pickPipeline(list, 1)?.id).toBe(1)
    expect(pickPipeline(list, 99)?.id).toBe(2)
    expect(pickPipeline([pipeline(5, false)], null)?.id).toBe(5)
    expect(pickPipeline([], null)).toBeNull()
  })

  it('lists stages in their order and says where the leads stand, and the share of closed ones won', () => {
    expect(stageRows(pipeline(1, true)).map(s => s.name)).toEqual(['New', 'Offer', 'Won', 'Lost'])
    expect(pipelineSummary(pipeline(1, true))).toEqual({ total: 15, open: 11, won: 3, lost: 1, winRate: 75 })
    expect(pipelineSummary({ ...pipeline(1, true), stages: [] }).winRate).toBeNull()
  })

  it('orders lost reasons by their leads and drops those with none', () => {
    expect(lostReasonRows([
      { id: 1, label: 'Price', is_active: true, inquiries_count: 2 },
      { id: 2, label: 'Dates', is_active: true, inquiries_count: 5 },
      { id: 3, label: 'Other', is_active: false, inquiries_count: 0 },
    ])).toEqual([{ id: 2, label: 'Dates', count: 5 }, { id: 1, label: 'Price', count: 2 }])
  })

  it('names a signal’s lead by the person, else the company, and writes rates', () => {
    expect(signalName({ id: 1, total_value: null, guest: { id: 2, full_name: ' Ada ', company: 'Acme' } })).toBe('Ada')
    expect(signalName({ id: 1, total_value: null, guest: { id: 2, full_name: null, company: 'Acme' } })).toBe('Acme')
    expect(signalName({ id: 1, total_value: null, guest: null })).toBeNull()
    expect(rate(43.5, 'en')).toBe('43.5 %')
    expect(rate(null, 'en')).toBe('—')
  })
})

describe('round 2: the sections and the venue’s zone', () => {
  it('keeps the section from the address, else the default given', () => {
    expect(sectionOf('pipeline')).toBe('pipeline')
    expect(sectionOf('chat', 'pipeline')).toBe('chat')
    expect(sectionOf(null)).toBe('chat')
    expect(sectionOf('nonsense', 'pipeline')).toBe('pipeline')
  })

  it('names the venue’s zone for the hour chart', () => {
    expect(zoneLabel('Europe/Riga')).toBe('Europe/Riga')
    expect(zoneLabel('America/New_York')).toBe('America/New York')
    expect(zoneLabel('  ')).toBe('UTC')
  })
})

describe('round 5: the chat’s intents, weekdays and lengths, the deals and the reports', () => {
  it('knows the four sections and the reports’ months', () => {
    expect(sectionOf('deals')).toBe('deals')
    expect(sectionOf('reports', 'pipeline')).toBe('reports')
    expect(sectionOf('nope', 'pipeline')).toBe('pipeline')
    expect(monthsOf('12')).toBe(12)
    expect(monthsOf('5')).toBe(6)
    expect(monthsOf(null)).toBe(6)
    expect(ownerDays(3)).toBe(90)
    expect(ownerDays(12)).toBe(180)
  })

  it('orders the intents by count, those not yet tagged last, without empty ones', () => {
    expect(intentRows([{ intent: 'untagged', count: 9 }, { intent: 'complaint', count: 1 }, { intent: 'booking_inquiry', count: 4 }, { intent: 'spam', count: 0 }, { intent: 'weird', count: 2 }]))
      .toEqual([
        { key: 'booking_inquiry', count: 4, known: true }, { key: 'weird', count: 2, known: false }, { key: 'complaint', count: 1, known: true }, { key: 'untagged', count: 9, known: true },
      ])
    expect(intentRows(undefined)).toEqual([])
  })

  it('names the weekdays in the person’s language, Monday first, every day present', () => {
    expect(weekdayName(1, 'en-GB')).toBe('Mon')
    expect(weekdayName(0, 'en-GB')).toBe('Sun')
    expect(weekdayName(1, 'de')).toBe('Mo')
    const rows = weekdayRows([{ dow: 6, label: 'Sat', conversations: 5, visitors: 5, replies: 1 }], 'en-GB')
    expect(rows.map(r => [r.dow, r.count])).toEqual([[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 5], [0, 0]])
    expect(busiestWeekday(rows)).toBe(6)
    expect(busiestWeekday(weekdayRows([], 'en'))).toBeNull()
    expect(lengthRows([{ bucket: 'none', label: '0 msg', count: '2' as unknown as number }])).toEqual([{ key: 'none', label: '0 msg', count: 2 }])
  })

  it('sums the deals’ period and groups a long series into weeks', () => {
    expect(dealTotals({ revenue_trend: [{ date: 'a', count: 1, revenue: 10.25 }, { date: 'b', count: 2, revenue: 5 }], new_deal_trend: [{ date: 'a', count: 3 }] }))
      .toEqual({ revenue: 15.25, completed: 3, fresh: 3 })
    const days = Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, value: 1 }))
    expect(dayBuckets(days)).toHaveLength(30)
    const long = Array.from({ length: 90 }, (_, i) => ({ date: `d${i}`, value: 1 }))
    const weeks = dayBuckets(long)
    expect(weeks).toHaveLength(13)
    expect(weeks[weeks.length - 1]).toEqual({ key: 'd83', from: 'd83', to: 'd89', value: 7 })
    expect(weeks[0].value).toBe(6)
  })

  it('orders the payments as named, unset last, without empty ones', () => {
    expect(paymentRows([{ status: 'unset', count: 2 }, { status: 'paid', count: 1 }, { status: 'pending', count: 0 }, { status: 'partial', count: 4 }]))
      .toEqual([{ key: 'partial', count: 4 }, { key: 'paid', count: 1 }, { key: 'unset', count: 2 }])
  })

  it('labels the forecast’s months and splits each into what is expected and the rest', () => {
    expect(monthLabel('2026-12', 'en-GB')).toBe('Dec 26')
    expect(monthLabel('beyond', 'en-GB')).toBeNull()
    expect(forecastColumns({ buckets: [{ month: 'x', key: '2026-12', gross_value: 1400, expected_value: 820, deal_count: 2 }] }))
      .toEqual([{ key: '2026-12', expected: 820, rest: 580, deals: 2 }])
  })

  it('tells a refusal for want of the right from a failure', () => {
    expect(refusedForRights('not_allowed')).toBe(true)
    expect(refusedForRights('no_capability')).toBe(true)
    expect(refusedForRights('network')).toBe(false)
    expect(refusedForRights('not_in_plan')).toBe(false)
  })
})
