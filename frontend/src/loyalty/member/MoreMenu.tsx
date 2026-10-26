import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Layers, Mail, MoreHorizontal, Power, PowerOff, Trash2, type LucideIcon } from 'lucide-react'
import { SideMenu } from '../../workspace/shell/SideMenu'
import type { MoreItem } from '../membership/membershipMath'
import { MORE_WORDS } from '../membership/words'
import { ICON_BUTTON } from './CardHead'

const ITEM = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-a-surface-2 focus:bg-a-surface-2 focus:outline-none'
const ICONS: Record<MoreItem, LucideIcon> = { welcome: Mail, tier: Layers, deactivate: PowerOff, reactivate: Power, erase: Trash2 }

/**
 * A member's More menu (spec 2026-10-21 release 2 §4.1; release 9 makes it the ⋯ button): the member in the full admin,
 * then the items membershipMath.ts `moreItems` offers this person for this member — Resend the welcome email, and a
 * manager's Change tier, Deactivate or Reactivate, and Delete (in the danger colour, last).
 */
export function MoreMenu({ items, fullAdmin, onPick }: { items: MoreItem[]; fullAdmin: string; onPick: (item: MoreItem) => void }) {
  const { t } = useTranslation()
  const label = t('loyalty.membership.more.label', 'More')
  return (
    <SideMenu kind="menu" place="down-right" label={label} named buttonClassName={ICON_BUTTON}
      face={<span title={label} className="inline-flex"><MoreHorizontal size={18} aria-hidden /></span>}
      listClassName="w-64">
      <Link to={fullAdmin} role="menuitem" data-more="full_admin" className={`${ITEM} text-a-text`}>
        <ExternalLink size={15} aria-hidden className="shrink-0 text-a-text-2" />{t('loyalty.member.full_admin', 'Open in full admin')}
      </Link>
      {items.map(item => {
        const Icon = ICONS[item]
        return (
          <button key={item} type="button" role="menuitem" data-more={item} onClick={() => onPick(item)}
            className={`${ITEM} ${item === 'erase' ? 'text-a-danger' : 'text-a-text'}`}>
            <Icon size={15} aria-hidden className={`shrink-0 ${item === 'erase' ? '' : 'text-a-text-2'}`} />
            {t(`loyalty.membership.more.${item}`, MORE_WORDS[item])}
          </button>
        )
      })}
    </SideMenu>
  )
}
