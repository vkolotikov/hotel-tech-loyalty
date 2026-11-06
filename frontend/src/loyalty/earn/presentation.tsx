import purchase from '../overview/assets/clean/f8281.svg'
import points from '../overview/assets/clean/1ed51.svg'
import gift from '../program/design/assets/9f980.svg'
import active from '../program/design/assets/17fc5.svg'
import members from '../members/assets/3bdeb.svg'
import rules from './assets/clean/2d1a7.svg'
import booking from './assets/clean/efaad.svg'
import checkin from './assets/clean/d6aea.svg'
import desk from './assets/clean/38047.svg'
import inactive from './assets/clean/b7fd2.svg'
import cashback from './assets/clean/80005.svg'
import birthday from './assets/clean/f8db8.svg'
import { useEarnWords } from './words'

const icons: Record<string, [string, string]> = {
  earn_rate: [purchase, 'cyan'], points: [points, 'cyan'], points_on_spend: [booking, 'violet'],
  stamp_card: [booking, 'violet'], check_in: [checkin, 'green'], desk_earn: [desk, 'neutral'],
  cashback: [cashback, 'amber'], welcome_bonus: [gift, 'violet'], birthday_bonus: [birthday, 'neutral'],
  referrals: [members, 'cyan'], bonus: [gift, 'violet'], rules: [rules, 'amber'],
}

/** Original Figma artwork at its native dimensions, inside the design's coloured tiles. */
export function EarnIcon({ kind }: { kind: string }) {
  const [src, tone] = icons[kind] ?? icons.points
  return <span className={`l-ec-icon l-ec-${tone}`} aria-hidden="true"><img src={src} alt="" /></span>
}

export function EarnState({ state }: { state: 'active' | 'off' | 'unused' }) {
  const say = useEarnWords()
  return <span className={`l-ec-status ${state === 'active' ? 'l-ec-active' : 'l-ec-inactive'}`}><img src={state === 'active' ? active : inactive} alt="" />{say(state)}</span>
}
