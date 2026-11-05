import { Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C } from '../lib/theme'

/** Original Figma Lucide vectors, rasterised at 3x. Unmapped platform controls use Ionicons. */
const assets = {
  person: require('../../assets/eclipse/ui-UserRound.png'),
  back: require('../../assets/eclipse/ui-ChevronLeft.png'),
  next: require('../../assets/eclipse/ui-Chevron.png'),
  plus: require('../../assets/eclipse/ui-Plus.png'), minus: require('../../assets/eclipse/ui-Minus.png'),
  gift: require('../../assets/eclipse/ui-Gift.png'), check: require('../../assets/eclipse/ui-Check.png'),
  receipt: require('../../assets/eclipse/ui-Receipt.png'), clock: require('../../assets/eclipse/ui-Clock3.png'),
  shield: require('../../assets/eclipse/ui-ShieldCheck.png'), globe: require('../../assets/eclipse/ui-Globe.png'),
  lock: require('../../assets/eclipse/ui-LockKeyhole.png'), bell: require('../../assets/eclipse/ui-Bell.png'),
  logout: require('../../assets/eclipse/ui-LogOut.png'), place: require('../../assets/eclipse/ui-MapPin.png'),
  keyboard: require('../../assets/eclipse/ui-Keyboard.png'), search: require('../../assets/eclipse/ui-Search.png'),
  calendar: require('../../assets/eclipse/ui-CalendarDays.png'), mail: require('../../assets/eclipse/ui-Mail.png'),
  activity: require('../../assets/eclipse/ui-Activity.png'), settings: require('../../assets/eclipse/ui-Settings2.png'),
  alert: require('../../assets/eclipse/ui-CircleAlert.png'), external: require('../../assets/eclipse/ui-ExternalLink.png'),
  nfc: require('../../assets/eclipse/ui-Nfc1.png'), close: require('../../assets/eclipse/ui-X.png'),
  card: require('../../assets/eclipse/ui-CreditCard.png'), eye: require('../../assets/eclipse/ui-Eye.png'),
  arrow: require('../../assets/eclipse/ui-ArrowRight.png'),
} as const
type Name = keyof typeof Ionicons.glyphMap
const mapped: Partial<Record<Name, keyof typeof assets>> = {
  'person-outline': 'person', 'person-circle-outline': 'person', 'people-outline': 'person',
  'chevron-back': 'back', 'chevron-forward': 'next', add: 'plus', 'add-circle': 'plus',
  'remove-circle': 'minus', gift: 'gift', 'gift-outline': 'gift', ribbon: 'gift', 'ribbon-outline': 'gift',
  checkmark: 'check', walk: 'check', receipt: 'receipt', 'receipt-outline': 'receipt',
  'time-outline': 'clock', 'shield-checkmark-outline': 'shield', 'trophy-outline': 'shield',
  'globe-outline': 'globe', 'lock-closed': 'lock', 'lock-closed-outline': 'lock',
  'notifications-outline': 'bell', 'log-out-outline': 'logout', 'location-outline': 'place',
  'storefront-outline': 'place', 'keypad-outline': 'keyboard', search: 'search',
  'calendar-outline': 'calendar', 'mail-outline': 'mail', 'megaphone-outline': 'mail',
  'stats-chart-outline': 'activity', 'settings-outline': 'settings', 'alert-circle': 'alert',
  'open-outline': 'external', 'radio-outline': 'nfc',
  close: 'close', 'close-circle': 'close', card: 'card', 'card-outline': 'card', eye: 'eye',
  'arrow-forward': 'arrow',
}
export function Glyph({ name, size = 24, color = C.text }: { name: Name; size?: number; color?: string }) {
  const asset = mapped[name]
  return asset ? <Image source={assets[asset]} resizeMode="contain" accessible={false} style={{ width: size, height: size, tintColor: color }} />
    : <Ionicons name={name} size={size} color={color} accessible={false} />
}
