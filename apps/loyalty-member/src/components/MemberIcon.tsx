import { useId } from 'react'
import { Asset } from 'expo-asset'
import Svg, { Defs, Mask, Rect, SvgUri } from 'react-native-svg'
import { C } from '../lib/theme'

const sources = {
  home: require('../../assets/eclipse/dock-home.svg'),
  gift: require('../../assets/eclipse/ui-Gift.svg'),
  card: require('../../assets/eclipse/ui-CreditCard.svg'),
  activity: require('../../assets/eclipse/ui-Activity.svg'),
  more: require('../../assets/eclipse/ui-Settings2.svg'),
  bell: require('../../assets/eclipse/ui-Bell.svg'),
  chevron: require('../../assets/eclipse/ui-Chevron.svg'),
  back: require('../../assets/eclipse/ui-ChevronLeft.svg'),
  check: require('../../assets/eclipse/ui-Check.svg'),
  close: require('../../assets/eclipse/ui-X.svg'),
  calendar: require('../../assets/eclipse/ui-CalendarDays.svg'),
  location: require('../../assets/eclipse/ui-MapPin.svg'),
  clock: require('../../assets/eclipse/ui-Clock3.svg'),
  shield: require('../../assets/eclipse/ui-ShieldCheck.svg'),
  globe: require('../../assets/eclipse/ui-Globe.svg'),
  lock: require('../../assets/eclipse/ui-LockKeyhole.svg'),
  mail: require('../../assets/eclipse/ui-Mail.svg'),
  logout: require('../../assets/eclipse/ui-LogOut.svg'),
  search: require('../../assets/eclipse/ui-Search.svg'),
  eye: require('../../assets/eclipse/ui-Eye.svg'),
  arrow: require('../../assets/eclipse/ui-ArrowRight.svg'),
  receipt: require('../../assets/eclipse/ui-Receipt.svg'),
  plus: require('../../assets/eclipse/ui-Plus.svg'),
  minus: require('../../assets/eclipse/ui-Minus.svg'),
  user: require('../../assets/eclipse/ui-UserRound.svg'),
  alert: require('../../assets/eclipse/ui-CircleAlert.svg'),
} as const
export type MemberIconName = keyof typeof sources

/** Exact Staff/Figma SVG geometry. A mask applies the venue tint without editing the asset's paths or bytes. */
export function MemberIcon({ name, size = 24, color = C.text }: { name: MemberIconName; size?: number; color?: string }) {
  const id = `member-icon-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const uri = Asset.fromModule(sources[name]).uri
  return <Svg width={size} height={size} viewBox="0 0 28 28" accessible={false}>
    <Defs><Mask id={id} x="0" y="0" width="28" height="28" maskUnits="userSpaceOnUse"><SvgUri uri={uri} x={2} y={2} width={24} height={24} /></Mask></Defs>
    <Rect width={28} height={28} fill={color} mask={`url(#${id})`} />
  </Svg>
}
