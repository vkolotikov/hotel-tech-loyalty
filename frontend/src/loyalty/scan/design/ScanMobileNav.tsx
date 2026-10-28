import { Link } from 'react-router-dom'
import { OverviewButton } from '../../overview/OverviewUI'
import { useScanWords } from './words'
import home from './assets/home.svg'
import members from './assets/members.svg'
import scan from './assets/scan.svg'
import requests from './assets/requests.svg'
import more from './assets/more.svg'

export function ScanMobileNav({ onMenu }: { onMenu: () => void }) {
  const words = useScanWords()
  return <nav className="l-sc-mobile-nav" aria-label={words('admin')}><Link to="/loyalty/overview"><img src={home} alt="" />{words('home')}</Link><Link to="/loyalty"><img src={members} alt="" />{words('members')}</Link><Link to="/loyalty/scan" aria-current="page"><img src={scan} alt="" />{words('scan')}</Link><Link to="/loyalty/requests"><img src={requests} alt="" />{words('requests')}</Link><button onClick={onMenu} aria-haspopup="dialog"><img src={more} alt="" />{words('more')}</button></nav>
}
export function ScanMobileHeader({ name, person, onMenu }: { name: string; person: string; onMenu: () => void }) {
  const words = useScanWords()
  return <header className="l-sc-mobile-header"><div><strong>{name}</strong><small>{words('admin')}</small></div><OverviewButton onClick={onMenu} aria-label={words('more')} aria-haspopup="dialog">{person.split(/\s+/).map(s => s[0]).slice(0, 2).join('')}</OverviewButton></header>
}
