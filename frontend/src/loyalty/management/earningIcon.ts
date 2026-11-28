import type { AdminAsset } from './assets'
export const earningIcon = (key: string): AdminAsset => ({ earn_rate: 'purchase', points_on_spend: 'calendar', stamp_card: 'ticket', check_in: 'pin', desk_earn: 'receipt', cashback: 'coins', referrals: 'referral', birthday_bonus: 'birthday', welcome_bonus: 'welcome' } as Record<string, AdminAsset>)[key] ?? 'coins'
