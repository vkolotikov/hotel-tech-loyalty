import { useTranslation } from 'react-i18next'
import { IdCard } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { day } from '../lib/format'
import { languageName } from '../membership/membershipMath'
import type { MemberProfile } from '../membership/types'
import { CARD, CardHead } from './CardHead'
import { ValidityCard } from '../membership/ValidityCard'
import { useRedesignWords } from '../redesign/words'

/**
 * The member's details on their page (spec 2026-10-21 release 2 §4.1): language, nationality, date of birth, marketing
 * consent and SMS offers; and, when a manager holds their tier, until when. The name, email, phone, member number and
 * the day they joined are the page's header (release 9: each once). A field nobody filled reads "Not given".
 */
export function DetailsCard({ member, locale, timeZone, redesigned = false, onEdit }: { member: MemberProfile; locale: string; timeZone: string; redesigned?: boolean; onEdit?: () => void }) {
  const { t } = useTranslation()
  const say = useRedesignWords()
  const none = t('loyalty.membership.page.not_given', 'Not given')
  const rows: [string, string, string | null][] = [
    ['language', t('loyalty.membership.page.language', 'Language'), member.language ? languageName(member.language, locale) : null],
    ['nationality', t('loyalty.membership.page.nationality', 'Nationality'), member.nationality || null],
    ['date_of_birth', t('loyalty.membership.page.date_of_birth', 'Date of birth'),
      member.date_of_birth ? formatDate(member.date_of_birth, locale, { day: 'numeric', month: 'long', year: 'numeric' }) : null],
    ['marketing', t('loyalty.membership.page.marketing', 'Marketing emails'),
      member.marketing_consent ? t('loyalty.membership.page.marketing_yes', 'Agreed') : t('loyalty.membership.page.marketing_no', 'Not agreed')],
    ['sms', t('loyalty.sms.member.label', 'Offers by SMS'), member.sms_consent ? t('loyalty.sms.member.on', 'Turned on by the member') : t('loyalty.sms.member.off', 'Off')],
  ]
  if (member.tier_override_until) {
    rows.push(['tier_kept', t('loyalty.membership.page.tier_kept', 'Tier kept until'), day(member.tier_override_until, locale, timeZone)])
  }

  if (redesigned) {
    const contact: [string, string, string | null][] = [
      ['email', t('loyalty.membership.details.email', 'Email'), member.email],
      ...(member.phone ? [['phone', t('loyalty.membership.details.phone', 'Phone'), member.phone] as [string, string, string | null]] : []),
      ['joined', t('loyalty.members.col_joined', 'Joined'), day(member.joined_at, locale, timeZone)],
      ['last', t('loyalty.members.col_last', 'Last seen'), member.last_activity_at ? day(member.last_activity_at, locale, timeZone) : t('loyalty.member.not_seen', 'Not seen yet')],
    ]
    const renderRows = (items: typeof rows) => <dl className="l-rd-detail-rows">{items.map(([key, label, value]) => <div key={key} data-detail={key} data-contact={key === 'email' || key === 'phone' ? key : undefined}><dt>{label}</dt><dd>{value ?? none}</dd></div>)}</dl>
    return <section className="l-ov-panel l-rd-details" aria-labelledby="details-title"><div className="l-rd-card-head"><h2 id="details-title">{say('memberDetails')}</h2>{onEdit && <button className="l-ov-link" onClick={onEdit}>{say('editDetails')}</button>}</div>
      {renderRows([...contact, ...rows.filter(([key]) => key !== 'marketing' && key !== 'sms')])}
      <div className="l-rd-compact-validity"><ValidityCard member={member} locale={locale} timeZone={timeZone} /></div>
      {renderRows(rows.filter(([key]) => key === 'marketing' || key === 'sms'))}
    </section>
  }

  return (
    <section aria-labelledby="details-title" className={CARD}>
      <CardHead id="details-title" icon={IdCard} title={t('loyalty.membership.page.details_title', 'Details')} />
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {rows.map(([key, label, value]) => (
          <div key={key} data-detail={key} className="min-w-0">
            <dt className="text-xs text-a-text-2">{label}</dt>
            <dd className={`break-words ${value === null ? 'text-a-text-2' : 'text-a-text'}`}>{value ?? none}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
