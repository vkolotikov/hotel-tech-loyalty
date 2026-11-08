import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CreditCard, Palette, Users, type LucideIcon } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { TONE_CHIP, type Tone } from '../ui/tones'

/**
 * Account: the organisation's own pages, outside the workspace, as two link cards — Team (/account/team) and Plan &
 * products (/account/products). The person's look and language are in the frame's menu under their name, so they are
 * only pointed to here.
 */
export function AccountTab() {
  const { t } = useTranslation()
  const boot = useBoot()
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <AccountLink to="/account/team" icon={Users} tone="accent" title={t('crm.settings.account.team', 'Team')}
          line={boot.staff.can.manage_team
            ? t('crm.settings.account.team_line', 'Invite colleagues, set what each may do, switch someone off.')
            : t('crm.settings.account.team_staff', 'See who works here. Only an owner or a manager can invite people.')}
          cta={t('crm.settings.account.open_team', 'Open Team')} />
        <AccountLink to="/account/products" icon={CreditCard} tone="success" title={t('crm.settings.account.plan', 'Plan & products')}
          line={t('crm.settings.account.plan_line', 'Your package, what it includes, and the other HexaTech products.')}
          cta={t('crm.settings.account.open_plan', 'Open Plan & products')} />
      </div>
      <p className="flex items-center gap-2 px-1 text-sm text-a-text-2">
        <Palette size={15} aria-hidden className="shrink-0" />{t('crm.settings.account.look', 'Your look (light or dark) and language are in the menu under your name.')}
      </p>
    </div>
  )
}

function AccountLink({ to, icon: Icon, tone, title, line, cta }: { to: string; icon: LucideIcon; tone: Tone; title: string; line: string; cta: string }) {
  return (
    <Link to={to} className="group flex min-h-40 flex-col gap-3 rounded-2xl border border-a-border bg-a-surface p-5 shadow-a-sm transition-colors hover:border-a-accent/50 focus-visible:outline-2 focus-visible:outline-a-accent">
      <span aria-hidden className={`grid h-11 w-11 place-items-center rounded-xl ${TONE_CHIP[tone]}`}><Icon size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-a-display text-xl text-a-text">{title}</span>
        <span className="mt-1 block text-sm text-a-text-2">{line}</span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-a-accent-text">
        {cta}<ArrowRight size={15} aria-hidden />
      </span>
    </Link>
  )
}
