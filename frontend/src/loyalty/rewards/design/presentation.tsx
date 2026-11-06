import gift from '../../program/design/assets/9f980.svg'
import active from '../../program/design/assets/17fc5.svg'
import upcoming from '../../program/design/assets/6788b.svg'
import members from '../../members/assets/3bdeb.svg'
import claim from '../../program/design/assets/88ced.svg'
import points from '../../overview/assets/clean/1ed51.svg'
import settings from '../../overview/assets/clean/3f35c.svg'
import calendar from './assets/clean/dc22c.svg'
import discount from './assets/clean/8124f.svg'
import inactive from './assets/clean/b7fd2.svg'
import ended from './assets/clean/effe4.svg'
import endedClaim from './assets/clean/ce013.svg'
import amberGift from './assets/clean/422e1.svg'
import typeSettings from './assets/clean/19e11.svg'
import neutralCalendar from '../../earn/assets/clean/f8db8.svg'

const icons = { gift: [gift, 'violet'], members: [members, 'cyan'], claim: [claim, 'cyan'], points: [points, 'cyan'],
  settings: [settings, 'amber'], calendar: [calendar, 'amber'], discount: [discount, 'amber'],
  ended: [endedClaim, 'neutral'], amberGift: [amberGift, 'amber'], typeSettings: [typeSettings, 'neutral'], calendarNeutral: [neutralCalendar, 'neutral'] } as const

export type RewardIconKind = keyof typeof icons

export function RewardIcon({ kind = 'gift' }: { kind?: RewardIconKind }) {
  const [src, tone] = icons[kind]
  return <span className={`l-rc-icon l-rc-${tone}`} aria-hidden="true"><img src={src} alt="" /></span>
}

export function RewardStatus({ tone, children }: { tone?: string; children: React.ReactNode }) {
  const color = tone === 'active' || tone === 'live' ? 'green' : tone === 'upcoming' ? 'cyan' : tone === 'soldOut' || tone === 'unassigned' || tone === 'off' ? 'amber' : 'neutral'
  const dot = color === 'green' ? active : color === 'cyan' ? upcoming : color === 'amber' ? inactive : ended
  return <span className={`l-rc-status l-rc-${color}`} data-tone={tone}><img src={dot} alt="" />{children}</span>
}
