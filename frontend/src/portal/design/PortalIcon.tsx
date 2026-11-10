import home from './assets/ae59e.svg'
import homeActive from './assets/17600.svg'
import rewards from './assets/b630b.svg'
import rewardsActive from './assets/07bbf.svg'
import bookings from './assets/33a8b.svg'
import bookingsActive from './assets/dd667.svg'
import profile from './assets/a8db5.svg'
import profileActive from './assets/10db8.svg'
import qr from './assets/0efab.svg'
import bell from './assets/6cc40.svg'
import star from './assets/846d5.svg'
import arrow from './assets/4ffab.svg'
import chevron from './assets/90956.svg'
import invite from './assets/360e4.svg'
import earn from './assets/e61f0.svg'
import coin from './assets/747b3.svg'
import check from './assets/b2a3e.svg'
import medal from './assets/cc6d0.svg'
import expand from './assets/f72d9.svg'
import ticket from './assets/adbcc.svg'
import calendar from './assets/87878.svg'
import person from './assets/a4c3f.svg'
import bed from './assets/69c4d.svg'
import clock from './assets/50eb5.svg'
import door from './assets/78545.svg'
import users from './assets/69b99.svg'
import history from './assets/c02f9.svg'
import mail from './assets/f9e4e.svg'
import phone from './assets/d54ad.svg'
import birthday from './assets/ff017.svg'
import globe from './assets/9d12f.svg'
import edit from './assets/fee7d.svg'
import logout from './assets/13639.svg'
import help from './assets/4e517.svg'
import lock from './assets/3145f.svg'
import copy from './assets/324e6.svg'
import homeMobile from './assets/0b6a9.svg'
import homeActiveMobile from './assets/e508e.svg'
import rewardsMobile from './assets/4b616.svg'
import rewardsActiveMobile from './assets/6d826.svg'
import bookingsMobile from './assets/c69f5.svg'
import profileMobile from './assets/b430d.svg'

const icons = { home, homeActive, rewards, rewardsActive, bookings, bookingsActive, profile, profileActive, qr, bell, star, arrow, chevron, invite, earn, coin, check, medal, expand, ticket, calendar, person, bed, clock, door, users, history, mail, phone, birthday, globe, edit, logout, help, lock, copy }
const mobile: Partial<Record<keyof typeof icons, string>> = { home: homeMobile, homeActive: homeActiveMobile, rewards: rewardsMobile, rewardsActive: rewardsActiveMobile, bookings: bookingsMobile, profile: profileMobile }
export type PortalIconName = keyof typeof icons

/** Original Figma vectors, at their intrinsic dimensions inside a stable icon slot. */
export function PortalIcon({ name, tile = false }: { name: PortalIconName; tile?: boolean }) {
  return <span className={tile ? 'p-icon-tile' : 'p-icon'} aria-hidden><picture>{mobile[name] && <source media="(max-width: 767px)" srcSet={mobile[name]} />}<img src={icons[name]} alt="" /></picture></span>
}

