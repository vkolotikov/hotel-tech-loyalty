import { useTranslation } from 'react-i18next'
import { venueToday } from '../../lib/dates'
import { Button } from '../../ui/Button'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Notice } from '../../ui/Notice'
import { Stepper } from '../../ui/Stepper'
import { addDays, datesProblem, nightsBetween, type StayState } from './staySteps'
import type { StayRules } from '../../lib/types'

interface Props {
  state: StayState
  rules: StayRules
  timezone: string
  onDates: (checkIn: string | null, checkOut: string | null) => void
  onGuests: (adults: number, children: number) => void
  onSearch: () => void
}

/**
 * Arrival, departure and who is coming. The browser's own date picker: it is the one every member already
 * knows on their own phone, it speaks their language, and it is reachable by keyboard and screen reader
 * without a line of ours. "Today" is the venue's day, not the member's.
 */
export function DatesStep({ state, rules, timezone, onDates, onGuests, onSearch }: Props) {
  const { t } = useTranslation()
  const today = venueToday(timezone)
  const problem = datesProblem(state.checkIn, state.checkOut, rules, today)
  const nights = state.checkIn && state.checkOut ? nightsBetween(state.checkIn, state.checkOut) : 0

  const sentence = problem === null ? null
    : problem.code === 'min_nights' ? t('portal.stay.min_nights', 'The shortest stay here is {{count}} nights.', { count: problem.count })
    : problem.code === 'max_nights' ? t('portal.stay.max_nights', 'The longest stay you can book online is {{count}} nights.', { count: problem.count })
    : t('portal.stay.pick_dates', 'Choose your arrival and departure dates.')

  return (
    <div className="space-y-5">
      <h2 tabIndex={-1} data-step-heading="dates" className="sr-only">{t('portal.stay.heading_dates', 'When would you like to stay?')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('portal.stay.check_in', 'Arrival')}>
          <input
            type="date"
            className={INPUT_CLASS}
            min={today}
            value={state.checkIn ?? ''}
            onChange={e => onDates(e.target.value || null, state.checkOut)}
          />
        </Field>
        <Field label={t('portal.stay.check_out', 'Departure')}>
          <input
            type="date"
            className={INPUT_CLASS}
            min={addDays(state.checkIn ?? today, 1)}
            value={state.checkOut ?? ''}
            onChange={e => onDates(state.checkIn, e.target.value || null)}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <Stepper
          label={t('portal.stay.adults', 'Adults')}
          value={state.adults}
          min={1}
          max={10}
          onChange={v => onGuests(v, state.children)}
          fewerLabel={t('portal.book.fewer', 'Fewer')}
          moreLabel={t('portal.book.more', 'More')}
        />
        <Stepper
          label={t('portal.stay.children', 'Children')}
          value={state.children}
          min={0}
          max={6}
          onChange={v => onGuests(state.adults, v)}
          fewerLabel={t('portal.book.fewer', 'Fewer')}
          moreLabel={t('portal.book.more', 'More')}
        />
      </div>

      {problem === null
        ? <p className="text-sm text-p-text-2">{t('portal.stay.nights_count', 'Nights: {{count}}', { count: nights })}</p>
        : problem.code === 'pick_dates'
          ? <p className="text-sm text-p-text-2">{sentence}</p>
          : <Notice tone="warning">{sentence}</Notice>}

      <Button type="button" full disabled={problem !== null} onClick={onSearch}>{t('portal.stay.see_rooms', 'See rooms')}</Button>
    </div>
  )
}
