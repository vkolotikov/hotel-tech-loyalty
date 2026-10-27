import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { MemberDetail, TierBenefitLine } from '../lib/types'
import { useTypedPhrase } from '../scan/useTypedPhrase'
import { benefitDetail } from '../scan/verdict'
import { RequestRow } from '../requests/RequestRow'
import { overviewAssets } from '../overview/assets'
import { APPLIES_TO_WORDS, FULFILLMENT_WORDS } from '../program/words'
import { DesignDialog } from './DesignUI'
import { useRedesignWords } from './words'

/** Read the member's actual entitlements; a preview never infers a discount from its name. */
export function ProfileBenefits({ detail }: { detail: MemberDetail }) {
  const say = useRedesignWords()
  const { t } = useTranslation()
  const phrase = useTypedPhrase()
  const [all, setAll] = useState(false)
  const [benefit, setBenefit] = useState<TierBenefitLine | null>(null)
  const [requests, setRequests] = useState(false)
  const visible = all ? detail.benefits : detail.benefits.slice(0, 2)
  const first = detail.requests[0]
  const value = (b: TierBenefitLine) => benefitDetail(b, phrase)
  return <section className="l-ov-panel l-rd-benefits" aria-labelledby="benefits-title">
    <div className="l-rd-card-head"><h2 id="benefits-title">{say('benefitsRequests')}</h2>{detail.benefits.length > 2 && <button className="l-ov-link" onClick={() => setAll(!all)} aria-expanded={all}>{all ? t('loyalty.scan.close', 'Close') : say('viewAll', { n: detail.benefits.length })}</button>}</div>
    {visible.length ? <ul>{visible.map(b => <li key={b.id}><img src={overviewAssets.gift} alt="" /><div><strong>{b.name}</strong><small>{value(b) || b.description || ''}</small></div><button className="l-ov-link" onClick={() => setBenefit(b)} aria-label={`${b.name}: ${say('details')}`}>{say('details')}</button></li>)}</ul> : <p>{t('loyalty.member.no_benefits', 'This tier has no benefits yet.')}</p>}
    <div className="l-rd-request-summary"><button className="l-ov-link" onClick={() => setRequests(!requests)} aria-expanded={requests}>{first ? say('requestsWaiting', { n: detail.requests.length }) : say('noRequests')}</button>{first && <><small>{first.benefit?.name}</small><Link className="l-ov-link" to={`/loyalty/requests?request=${first.id}&tab=${first.state === 'approved' ? 'approved' : 'waiting'}`}>{say('openRequest')}</Link></>}</div>
    {requests && <div><h3>{t('loyalty.member.requests_title', 'Requests')}</h3>{detail.requests.length ? <ul>{detail.requests.map(r => <RequestRow key={r.id} request={r} showMember={false} compact />)}</ul> : <p>{t('loyalty.member.no_requests', 'Nothing waits for the team.')}</p>}</div>}
    {benefit && <DesignDialog title={benefit.name} onClose={() => setBenefit(null)}><div className="l-rd-form"><p>{value(benefit) || benefit.description || say('detailsUnavailable')}</p>{value(benefit) && benefit.description && <p>{benefit.description}</p>}{benefit.applies_to && <p>{t('loyalty.program.tier_benefit.applies_to', 'Applies to')}: {t(`loyalty.program.applies_to.${benefit.applies_to}`, APPLIES_TO_WORDS[benefit.applies_to] ?? benefit.applies_to)}</p>}{benefit.fulfillment_mode && <p>{t(`loyalty.program.fulfillment_mode.${benefit.fulfillment_mode}`, FULFILLMENT_WORDS[benefit.fulfillment_mode] ?? benefit.fulfillment_mode)}</p>}</div></DesignDialog>}
  </section>
}
