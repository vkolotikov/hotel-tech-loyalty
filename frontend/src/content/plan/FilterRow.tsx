import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, ListFilter } from 'lucide-react'
import type { Platform, PostStatus } from '../lib/types'
import { SideMenu } from '../shell/SideMenu'
import { PlatformMark } from '../ui/PlatformMark'
import { toggleShown, type PlanFilter } from './planMath'

const CHIP = 'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors'
const ITEM = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-a-text hover:bg-a-surface-2 focus-visible:bg-a-surface-2'

/**
 * The Plan's filter row above the calendar (spec 2026-10-21 §6.2): a chip per channel (its mark, its name, a tick while it
 * shows), Status as a menu chip naming the choice, the Unscheduled chip, and the Key dates switch at the end.
 */
export function FilterRow({ platforms, filter, statuses, onFilter, keyDates = true, onKeyDates, unscheduled }: {
  /** The platform chips worth offering (planMath.presentPlatforms). */
  platforms: Platform[]
  filter: PlanFilter
  statuses: PostStatus[]
  onFilter: (filter: PlanFilter) => void
  keyDates?: boolean
  onKeyDates?: (on: boolean) => void
  /** The "Unscheduled (n)" chip (UnscheduledChip). */
  unscheduled: ReactNode
}) {
  const { t } = useTranslation()
  const statusName = filter.status === 'all' ? null : t(`content.status.${filter.status}`, filter.status)
  return (
    <div data-filter-row="" className="flex flex-wrap items-center gap-1.5 px-4 pb-3 lg:px-6">
      {platforms.length > 1 && (
        <div role="group" aria-label={t('content.plan.filter_platforms', 'Platforms')} className="flex flex-wrap items-center gap-1.5">
          {platforms.map(p => {
            const on = filter.platforms.length === 0 || filter.platforms.includes(p)
            return (
              <button key={p} type="button" aria-pressed={on} onClick={() => onFilter({ ...filter, platforms: toggleShown(filter.platforms, p, platforms) })}
                className={`${CHIP} ${on ? 'border-a-border bg-a-surface text-a-text' : 'border-a-border bg-transparent text-a-text-2 hover:text-a-text'}`}>
                <PlatformMark platform={p} size="sm" />{t(`content.platform.${p}`, p)}
                {on && <Check data-tick="" size={12} aria-hidden className="text-a-accent-text" />}
              </button>
            )
          })}
        </div>
      )}
      <SideMenu label={t('content.plan.filter_status', 'Status')} kind="menu" place="down" listClassName="w-56"
        buttonClassName={`${CHIP} ${statusName ? 'border-a-accent-text bg-a-surface text-a-text' : 'border-a-border bg-a-surface text-a-text hover:bg-a-surface-2'}`}
        face={<>
          <ListFilter size={13} aria-hidden className="text-a-text-2" />
          {statusName ? t('content.plan.status_chip', 'Status: {{name}}', { name: statusName }) : t('content.plan.filter_status', 'Status')}
          <ChevronDown size={12} aria-hidden className="text-a-text-2" />
        </>}>
        {(['all', ...statuses] as PlanFilter['status'][]).map(s => (
          <button key={s} type="button" role="menuitemradio" aria-checked={filter.status === s} tabIndex={-1}
            onClick={() => onFilter({ ...filter, status: s })} className={ITEM}>
            <span className="w-3.5 shrink-0">{filter.status === s && <Check size={13} aria-hidden className="text-a-accent-text" />}</span>
            {s === 'all' ? t('content.plan.all_statuses', 'All statuses') : t(`content.status.${s}`, s)}
          </button>
        ))}
      </SideMenu>
      {unscheduled}
      {onKeyDates && (
        <button type="button" role="switch" aria-checked={keyDates} onClick={() => onKeyDates(!keyDates)}
          className="ml-auto inline-flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs font-medium text-a-text">
          {t('content.plan.key_dates', 'Key dates')}
          <span aria-hidden className={`relative h-4 w-7 rounded-full transition-colors ${keyDates ? 'bg-a-accent' : 'bg-a-border'}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-a-surface transition-all ${keyDates ? 'left-3.5' : 'left-0.5'}`} />
          </span>
        </button>
      )}
    </div>
  )
}
