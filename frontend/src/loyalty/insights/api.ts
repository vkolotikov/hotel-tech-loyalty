import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { AtRisk, Cohorts, Insights, Money, Period } from './types'

/** Insights' two reads (spec 2026-10-21 release 2 §5). The server refuses anyone without the right, whatever is shown. */
export const insightsApi = {
  insights: (period: Period): Promise<Insights> => watched(api.get(loyaltyUrl('insights'), { params: { period } })),
  atRisk: (days: number): Promise<AtRisk> => watched(api.get(loyaltyUrl('insights/at-risk'), { params: { days } })),
  /** Release 4: cohort retention, and the money members bring in a period. */
  cohorts: (): Promise<Cohorts> => watched(api.get(loyaltyUrl('insights/cohorts'))),
  money: (period: Period): Promise<Money> => watched(api.get(loyaltyUrl('insights/money'), { params: { period } })),
}

export const insightsKey = (period: Period) => ['loyalty', 'insights', period] as const
export const atRiskKey = (days: number) => ['loyalty', 'insights', 'at-risk', days] as const
export const cohortsKey = ['loyalty', 'insights', 'cohorts'] as const
export const moneyKey = (period: Period) => ['loyalty', 'insights', 'money', period] as const
