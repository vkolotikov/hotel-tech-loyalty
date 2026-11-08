import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarClock, Palette, Users, UsersRound, type LucideIcon } from 'lucide-react'
import { FULL_ADMIN } from '../lib/links'
import { TONE_CHIP, type Tone } from '../ui/tones'

/**
 * Account: where the rest of the planner's set-up lives — each person's hours, days, break and skills on Team & skills,
 * and the full admin's own Planner (its industry presets, employee preferences and reports) and Team (invitations and
 * roles). The Time Planner is the Enterprise plan's, so its organisations are full customers with a full admin.
 */
export function AccountSection() {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <AccountLink to="/time/team" icon={Users} tone="accent" title={t('time.nav.team', 'Team & skills')}
          line={t('time.settings.account.team_line', 'Each person’s own hours, working days, break, skills and what they know.')}
          cta={t('time.settings.account.open_team', 'Open Team & skills')} />
        <AccountLink to={FULL_ADMIN} icon={CalendarClock} tone="progress" title={t('time.settings.account.planner', 'The full admin’s Planner')}
          line={t('time.settings.account.planner_line', 'Industry presets, employee preferences and the planner’s own reports.')}
          cta={t('time.settings.account.open_planner', 'Open the Planner')} />
        <AccountLink to="/settings?tab=team" icon={UsersRound} tone="success" title={t('time.settings.account.admin_team', 'The full admin’s Team')}
          line={t('time.settings.account.admin_team_line', 'Invite colleagues, give them roles, switch someone off.')}
          cta={t('time.settings.account.open_admin_team', 'Open Team')} />
      </div>
      <p className="flex items-center gap-2 px-1 text-sm text-a-text-2">
        <Palette size={15} aria-hidden className="shrink-0" />{t('time.settings.account.look', 'Your look (light or dark) and language are in the menu under your name.')}
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
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-a-accent-text">{cta}<ArrowRight size={15} aria-hidden /></span>
    </Link>
  )
}
