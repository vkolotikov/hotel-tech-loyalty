import type { AdminAsset } from './assets'
export const earningIcon = (key: string): AdminAsset => ({ earn_rate: 'coins', points_on_spend: 'receipt', stamp_card: 'ticket', check_in: 'pin', desk_earn: 'calendar', cashback: 'purchase', referrals: 'referral', birthday_bonus: 'birthday', welcome_bonus: 'welcome' } as Record<string, AdminAsset>)[key] ?? 'coins'
