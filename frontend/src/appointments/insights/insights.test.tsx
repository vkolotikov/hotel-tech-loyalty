import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { money } from '../../lib/money'
import type { Insights, InsightsFigures } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { InsightsView, InsightsError } = await import('./InsightsPage')

const empty: InsightsFigures = {
  groups: { done: 0, no_show: 0, unmarked: 0, late_cancel: 0, early_cancel: 0, ahead: 0 },
  due: 0, money: {}, main_currency: null, by_service: [], by_person: [], sources: { online: 0, desk: 0, other: 0 },
}
const week: Insights = {
  period: { from: '2026-10-05', to: '2026-10-11', days: 7 },
  previous: { from: '2026-09-28', to: '2026-10-04', days: 7 },
  now: '2026-10-08T14:05',
  cancel_hours: 24,
  desk_ledger_since: '2026-10-05',
  current: {
    groups: { done: 84, no_show: 6, unmarked: 9, late_cancel: 9, early_cancel: 14, ahead: 31 },
    due: 108,
    money: { EUR: { done: 84, value_done: 4210, taken: 3950, owed_done: 260 } },
    main_currency: 'EUR',
    by_service: [{ id: 3, name: 'Haircut', due: 52, done: 44, no_show: 3, late_cancel: 4, value_done: { EUR: 1980 } },
      { id: 9, name: null, due: 1, done: 1, no_show: 0, late_cancel: 0, value_done: { EUR: 30 } }],
    by_person: [{ id: null, name: null, due: 2, done: 2, no_show: 0, late_cancel: 0, value_done: { EUR: 90 } }],
    sources: { online: 61, desk: 44, other: 3 },
  },
  before: {
    ...empty,
    groups: { done: 72, no_show: 7, unmarked: 0, late_cancel: 7, early_cancel: 10, ahead: 0 },
    due: 86,
    money: { EUR: { done: 72, value_done: 3680, taken: 3540, owed_done: 140 } },
    main_currency: 'EUR',
  },
}

describe('Insights', () => {
  it('names the period, what it is compared with and what late means', () => {
    const html = renderToStaticMarkup(<InsightsView data={week} locale="en-GB" />)
    expect(html).toContain('compared with')
    expect(html).toContain('late = cancelled inside 24 h')
    expect(html).toContain('were not recorded here') // compared with 28 Sep – 4 Oct, before the desk ledger
    const later: Insights = { ...week, period: { from: '2026-10-12', to: '2026-10-18', days: 7 }, previous: { from: '2026-10-05', to: '2026-10-11', days: 7 } }
    expect(renderToStaticMarkup(<InsightsView data={later} locale="en-GB" />)).not.toContain('were not recorded here')
  })

  it('shows the seven tiles with shares and changes from the period before', () => {
    const html = renderToStaticMarkup(<InsightsView data={week} locale="en" />)
    for (const title of ['Visits done', 'No-shows', 'Late cancellations', 'Value of visits done', 'Average per visit', 'Money taken', 'Still owed']) {
      expect(html).toContain(title)
    }
    expect(html).toContain('78%')        // 84 of 108
    expect(html).toContain('5.6%')       // 6 of 108
    expect(html).toContain('▲ 12 vs 72') // visits done
    // money() formats with the machine's locale (as on Takings): compare with its own output, never a hard-coded separator.
    expect(html).toContain(money(4210, 'EUR'))
    expect(html).toContain(`▲ ${money(530, 'EUR')}`)
    expect(html).toContain('text-a-st-confirmed') // a good change is green
    expect(html).toContain('text-a-danger')       // late cancellations went up: red
  })

  it('says what the rates are out of and what is not counted in them', () => {
    expect(renderToStaticMarkup(<InsightsView data={week} locale="en" />))
      .toContain('Out of 108 bookings due · 9 not marked yet (mark them Completed or No-show) · 14 cancelled in time · 31 booked ahead')
  })

  it('lists rows by service and by person, with removed and unassigned rows named', () => {
    const html = renderToStaticMarkup(<InsightsView data={week} locale="en" />)
    expect(html).toContain('By service')
    expect(html).toContain('Haircut')
    expect(html).toContain('(removed)')
    expect(html).toContain('By person')
    expect(html).toContain('No one assigned')
  })

  it('says where bookings come from', () => {
    expect(renderToStaticMarkup(<InsightsView data={week} locale="en" />))
      .toContain('Online 61 · At the desk 44 · Other 3 — booked online: 56%')
  })

  it('reads — when nothing is due', () => {
    const ahead: Insights = { ...week, current: { ...empty, groups: { ...empty.groups, ahead: 5 }, sources: { online: 5, desk: 0, other: 0 } } }
    const html = renderToStaticMarkup(<InsightsView data={ahead} locale="en" />)
    expect(html).toContain('—')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('(0%)') // a rate with nothing due is "—", never 0% (the sources line's 100% is right)
  })

  it('shows one money line per currency', () => {
    const two: Insights = { ...week, current: { ...week.current, money: { EUR: week.current.money.EUR, USD: { done: 2, value_done: 100, taken: 100, owed_done: 0 } } } }
    const html = renderToStaticMarkup(<InsightsView data={two} locale="en" />)
    expect(html).toContain(money(4210, 'EUR'))
    expect(html).toContain(money(100, 'USD'))
  })

  it('warns that money before the desk ledger was not recorded', () => {
    const october: Insights = { ...week, period: { from: '2026-10-01', to: '2026-10-31', days: 31 } }
    expect(renderToStaticMarkup(<InsightsView data={october} locale="en" />)).toContain('were not recorded here')
  })

  it('says so when the period has no appointments', () => {
    expect(renderToStaticMarkup(<InsightsView data={{ ...week, current: empty }} locale="en" />)).toContain('No appointments in this period.')
  })

  it('tells a staff member who types the address that Insights are for managers', () => {
    // The browser check: the workspace's generic not_allowed words speak of "this appointment".
    const refused = { response: { status: 403, data: { error: 'not_allowed', message: 'Only an owner or a manager can change this.' } } }
    const html = renderToStaticMarkup(<InsightsError error={refused} />)
    expect(html).toContain('Insights are for owners and managers.')
    expect(html).not.toContain('appointment')
  })

  it('shows the workspace’s own sentence for an error it has no words for', () => {
    // Final review: a gateway page (502/504, no JSON) drew an empty red box, a 500 its raw "Server Error".
    for (const error of [{ response: { status: 502, data: '<html>Bad gateway</html>' } }, { response: { status: 500, data: { message: 'Server Error' } } }]) {
      const html = renderToStaticMarkup(<InsightsError error={error} />)
      expect(html).toContain('Something went wrong. Please try again.')
      expect(html).not.toContain('Server Error')
    }
  })

  it('warns about money before the desk ledger when the period compared with starts before it', () => {
    // Final review: November compared with October (1–4 Oct had no desk ledger) inflated "Money taken ▲" with no note.
    const november: Insights = { ...week, period: { from: '2026-11-01', to: '2026-11-30', days: 30 }, previous: { from: '2026-10-01', to: '2026-10-31', days: 31 } }
    expect(renderToStaticMarkup(<InsightsView data={november} locale="en" />)).toContain('were not recorded here')
  })

  it('shows the server’s sentence for a refused period', () => {
    const refused = { response: { status: 422, data: { error: 'invalid_period', message: 'Choose a period of up to a year.' } } }
    expect(renderToStaticMarkup(<InsightsError error={refused} />)).toContain('Choose a period of up to a year.')
  })
})
