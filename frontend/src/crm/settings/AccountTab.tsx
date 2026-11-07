import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CreditCard, Users, type LucideIcon } from 'lucide-react'
import { useBoot } from '../CrmProvider'

/**
 * Account: the organisation's own pages, outside the workspace (Team at /account/team, Plan & products at
 * /account/products). The person's look and language are in the frame's menu under their name, so they are not here.
 */
export function AccountTab() {
  const { t } = useTranslation()
  const boot = useBoot()
  return (
    <div className="space-y-3">
      <AccountLink to="/account/team" icon={Users} title={t('crm.settings.account.team', 'Team')}
        line={boot.staff.can.manage_team
          ? t('crm.settings.account.team_line', 'Invite colleagues, set what each may do, switch someone off.')
          : t('crm.settings.account.team_staff', 'See who works here. Only an owner or a manager can invite people.')} />
      <AccountLink to="/account/products" icon={CreditCard} title={t('crm.settings.account.plan', 'Plan & products')}
        line={t('crm.settings.account.plan_line', 'Your package, what it includes, and the other HexaTech products.')} />
      <p className="px-1 text-sm text-a-text-2">{t('crm.settings.account.look', 'Your look (light or dark) and language are in the menu under your name.')}</p>
    </div>
  )
}

function AccountLink({ to, icon: Icon, title, line }: { to: string; icon: LucideIcon; title: string; line: string }) {
  return (
    <Link to={to} className="flex items-center gap-4 rounded-2xl border border-a-border bg-a-surface p-4 shadow-a-sm transition-colors hover:border-a-accent/40 focus-visible:outline-2 focus-visible:outline-a-accent">
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-a-accent/12 text-a-accent-text"><Icon size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-a-text">{title}</span>
        <span className="block text-sm text-a-text-2">{line}</span>
      </span>
      <ArrowRight size={16} aria-hidden className="shrink-0 text-a-text-2" />
    </Link>
  )
}
