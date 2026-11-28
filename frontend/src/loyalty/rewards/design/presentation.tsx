import type { ReactNode } from 'react'
import { ManagementIcon, ManagementStatus } from '../../management/ManagementUI'
import type { AdminAsset } from '../../management/assets'
const icons = { gift: ['perkSpark', 'violet'], members: ['perkPeople', 'cyan'], claim: ['rewardTicket', 'cyan'], points: ['redeemCoin', 'cyan'], settings: ['pen', 'gold'], calendar: ['offerCalendar', 'gold'], discount: ['perkTag', 'gold'], ended: ['rewardClock', 'neutral'], amberGift: ['offerGift', 'gold'], typeSettings: ['rewardFile', 'neutral'], calendarNeutral: ['perkCalendar', 'neutral'] } as const satisfies Record<string, readonly [AdminAsset, string]>
export type RewardIconKind = keyof typeof icons
export function RewardIcon({ kind = 'gift' }: { kind?: RewardIconKind }) { return <ManagementIcon kind={icons[kind][0]} tone={icons[kind][1]} /> }
export function RewardStatus({ tone, children }: { tone?: string; children: ReactNode }) { return <ManagementStatus state={tone}>{children}</ManagementStatus> }
