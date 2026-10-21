import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import { SideMenu } from '../../workspace/shell/SideMenu'
import type { MoreItem } from '../membership/membershipMath'
import { MORE_WORDS } from '../membership/words'

const ITEM = 'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm hover:bg-a-surface-2 focus:bg-a-surface-2 focus:outline-none'

/**
 * A member's More menu (spec 2026-10-21 release 2 §4.1): the items membershipMath.ts `moreItems` offers this person
 * for this member — Resend the welcome email, and a manager's Change tier, Deactivate or Reactivate, and Delete
 * (in the danger colour, last). Nothing when it would be empty.
 */
export function MoreMenu({ items, onPick }: { items: MoreItem[]; onPick: (item: MoreItem) => void }) {
  const { t } = useTranslation()
  if (items.length === 0) return null
  return (
    <SideMenu kind="menu" place="down-right" label={t('loyalty.membership.more.label', 'More')}
      buttonClassName="inline-flex items-center gap-1.5 rounded-full border border-a-border bg-a-surface px-3 py-2 text-sm font-semibold text-a-text hover:bg-a-surface-2"
      face={<><MoreHorizontal size={16} aria-hidden /><span>{t('loyalty.membership.more.label', 'More')}</span></>}
      listClassName="w-60">
      {items.map(item => (
        <button key={item} type="button" role="menuitem" data-more={item} onClick={() => onPick(item)}
          className={`${ITEM} ${item === 'erase' ? 'text-a-danger' : 'text-a-text'}`}>
          {t(`loyalty.membership.more.${item}`, MORE_WORDS[item])}
        </button>
      ))}
    </SideMenu>
  )
}
