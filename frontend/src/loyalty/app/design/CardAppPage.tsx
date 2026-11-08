import { Link } from 'react-router-dom'
import { Clock3, Monitor, Smartphone } from 'lucide-react'
import { useBoot } from '../../LoyaltyProvider'
import { OverviewRecovery } from '../../overview/OverviewUI'
import { WalletConnections } from './WalletConnections'
import { useCardWords } from './words'
import './cardApp.css'

/** Only controls connected to a member client are offered as live design tools. */
export function CardAppPage() {
  const boot = useBoot(), say = useCardWords()
  return <div className="l-ov-page l-ca-page">
    <header className="l-ov-page-heading"><div><h1>{say('title')}</h1><p>{say('availabilityLine')}</p></div></header>
    {!boot.staff.can.manage_app ? <OverviewRecovery forbidden onRetry={() => {}} /> : <>
      <AppDesignAvailability />
      <WalletConnections />
      <p className="l-ca-wallet-note">{say('walletBranding')}</p>
      <div className="l-ca-related l-ca-footer"><Link to="/loyalty/app?tab=currency" className="l-ov-link">{say('currency')} →</Link></div>
    </>}
  </div>
}

export function AppDesignAvailability() {
  const say = useCardWords()
  return <section aria-label={say('designAvailability')} className="l-ca-availability">
    {(['member', 'desktop'] as const).map(kind => {
      const Icon = kind === 'member' ? Smartphone : Monitor
      return <section className="l-ov-panel l-ca-panel" data-design={kind} key={kind}>
        <div className="l-ca-wallet-heading"><h2><Icon size={20} aria-hidden />{say(kind === 'member' ? 'memberDesigner' : 'desktopDesigner')}</h2><span className="l-ca-status"><Clock3 size={14} aria-hidden />{say('onHold')}</span></div>
        <p>{say(kind === 'member' ? 'memberDesignHold' : 'desktopDesignHold')}</p>
        <small>{say(kind === 'member' ? 'currentBranding' : 'desktopAppScope')}</small>
      </section>
    })}
  </section>
}
