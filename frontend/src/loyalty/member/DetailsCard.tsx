import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import { Eyebrow } from '../../workspace/ui/Typography'
import { day } from '../lib/format'
import { languageName } from '../membership/membershipMath'
import type { MemberProfile } from '../membership/types'

/**
 * The member's details on their page (spec 2026-10-21 release 2 §4.1): email, phone, language, nationality, date of
 * birth, marketing consent, member number and the day they joined; and, when a manager holds their tier, until when.
 * A field nobody filled reads "Not given".
 */
export function DetailsCard({ member, locale, timeZone }: { member: MemberProfile; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  const none = t('loyalty.membership.page.not_given', 'Not given')
  const rows: [string, string, string][] = [
    ['email', t('loyalty.membership.page.email', 'Email'), member.email ?? none],
    ['phone', t('loyalty.membership.page.phone', 'Phone'), member.phone ?? none],
    ['language', t('loyalty.membership.page.language', 'Language'), member.language ? languageName(member.language, locale) : none],
    ['nationality', t('loyalty.membership.page.nationality', 'Nationality'), member.nationality ?? none],
    ['date_of_birth', t('loyalty.membership.page.date_of_birth', 'Date of birth'),
      member.date_of_birth ? formatDate(member.date_of_birth, locale, { day: 'numeric', month: 'long', year: 'numeric' }) : none],
    ['marketing', t('loyalty.membership.page.marketing', 'Marketing emails'),
      member.marketing_consent ? t('loyalty.membership.page.marketing_yes', 'Agreed') : t('loyalty.membership.page.marketing_no', 'Not agreed')],
    ['sms', t('loyalty.sms.member.label', 'Offers by SMS'), member.sms_consent ? t('loyalty.sms.member.on', 'Turned on by the member') : t('loyalty.sms.member.off', 'Off')],
    ['number', t('loyalty.membership.page.number', 'Member number'), member.member_number ?? none],
    ['joined', t('loyalty.membership.page.joined', 'Joined'), day(member.joined_at, locale, timeZone) || none],
  ]
  if (member.tier_override_until) {
    rows.push(['tier_kept', t('loyalty.membership.page.tier_kept', 'Tier kept until'), day(member.tier_override_until, locale, timeZone)])
  }

  return (
    <section aria-labelledby="details-title" className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-5">
      <Eyebrow><span id="details-title">{t('loyalty.membership.page.details_title', 'Details')}</span></Eyebrow>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([key, label, value]) => (
          <div key={key} data-detail={key} className="min-w-0">
            <dt className="text-xs text-a-text-2">{label}</dt>
            <dd className="break-words text-a-text">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
