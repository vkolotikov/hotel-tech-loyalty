import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Coins, CreditCard, Smartphone, type LucideIcon } from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { useBoot } from '../LoyaltyProvider'
import { APP_TABS, appAccess, tabFrom, type AppTab } from './appMath'
import { CurrencyTab } from './CurrencyTab'
import { LookTab } from './LookTab'
import { WalletTab } from './WalletTab'
import { TAB_CAPTION_WORDS, TAB_WORDS } from './words'
import { SectionCards } from '../ui/SectionCards'
import type { Hue } from '../ui/sections'
import { CardAppPage } from './design/CardAppPage'
import { useCardWords } from './design/words'

const TAB_ICONS: Record<AppTab, LucideIcon> = { wallet: CreditCard, app: Smartphone, currency: Coins }
/** Each tab's colour (release 10): the wallet card amber, the app blue, the currency green. */
const TAB_HUE: Record<AppTab, Hue> = { wallet: 'gift', app: 'tier', currency: 'earn' }

/**
 * Card & app (release 2 §7): the wallet pass members add to Apple Wallet and Google Wallet, and how the member app
 * looks, and since release 4 the venue's currency (R4-5). A manager's (`manage_app`); anyone else who opens it by
 * address reads why. The tab lives in the address (`?tab=wallet|app|currency`), so a link opens the same one.
 */
export function AppPage() {
  const location = useLocation(), say = useCardWords()
  const params = new URLSearchParams(location.search)
  if (!params.has('tab') && params.get('view') !== 'detailed') return <CardAppPage />
  return <div className="l-ca-settings"><Link to="/loyalty/app" className="l-ov-link">← {say('back')}</Link><AppSettings /></div>
}

function AppSettings() {
  const { t } = useTranslation()
  const boot = useBoot()
  const location = useLocation()
  const navigate = useNavigate()
  const tab = tabFrom(location.search)
  const access = appAccess(boot.staff.can, boot.features)
  const go = (next: AppTab) => navigate({ pathname: '/loyalty/app', search: `?tab=${next}` }, { replace: true })
  const title = t('loyalty.app.title', 'Card & app')

  if (!access.manage) {
    return (
      <div className="space-y-5 px-4 py-6 lg:px-6">
        <PageHeader title={title} />
        <div className="max-w-xl">
          <Notice>{t('loyalty.app.managers_only', 'The wallet pass and the member app’s look are set by an owner or a manager.')}</Notice>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader stacked title={title} line={t('loyalty.app.line', 'The card members keep in their phone’s wallet, and how the member app looks.')} />

      <SectionCards label={t('loyalty.app.tabs', 'Card and app areas')} idPrefix="app-tab" panelId="app-panel" value={tab} onChange={go}
        items={APP_TABS.map(name => ({
          id: name, icon: TAB_ICONS[name], hue: TAB_HUE[name],
          title: t(`loyalty.app.tab.${name}`, TAB_WORDS[name]),
          caption: t(`loyalty.app.tab_caption.${name}`, TAB_CAPTION_WORDS[name]),
        }))} />

      <div id="app-panel" role="tabpanel" aria-labelledby={`app-tab-${tab}`} className="space-y-5">
        {tab === 'wallet' ? <WalletTab wallet={access.wallet} /> : tab === 'currency' ? <CurrencyTab /> : <LookTab />}
      </div>
    </div>
  )
}
