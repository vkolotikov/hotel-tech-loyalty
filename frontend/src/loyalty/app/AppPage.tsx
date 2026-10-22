import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { useBoot } from '../LoyaltyProvider'
import { APP_TABS, appAccess, searchFor, tabAfter, tabFrom, type AppTab } from './appMath'
import { CurrencyTab } from './CurrencyTab'
import { LookTab } from './LookTab'
import { WalletTab } from './WalletTab'
import { TAB_WORDS } from './words'

/**
 * Card & app (release 2 §7): the wallet pass members add to Apple Wallet and Google Wallet, and how the member app
 * looks, and since release 4 the venue's currency (R4-5). A manager's (`manage_app`); anyone else who opens it by
 * address reads why. The tab lives in the address (`?tab=wallet|app|currency`), so a link opens the same one.
 */
export function AppPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const location = useLocation()
  const navigate = useNavigate()
  const tab = tabFrom(location.search)
  const access = appAccess(boot.staff.can, boot.features)
  const go = (next: AppTab) => navigate({ pathname: '/loyalty/app', search: searchFor(next) }, { replace: true })
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
      <PageHeader title={title} line={t('loyalty.app.line', 'The card members keep in their phone’s wallet, and how the member app looks.')} />

      <div role="tablist" aria-label={t('loyalty.app.tabs', 'Card and app areas')} className="flex flex-wrap gap-2">
        {APP_TABS.map(name => (
          // One tab stop; the arrow keys, Home and End move between the tabs.
          <button key={name} type="button" role="tab" id={`app-tab-${name}`} aria-selected={tab === name} aria-controls="app-panel"
            tabIndex={tab === name ? 0 : -1} onClick={() => go(name)} onKeyDown={(e) => {
              const next = tabAfter(tab, e.key)
              if (next === null) return
              e.preventDefault()
              go(next)
              document.getElementById(`app-tab-${next}`)?.focus()
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium ${tab === name ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
            {t(`loyalty.app.tab.${name}`, TAB_WORDS[name])}
          </button>
        ))}
      </div>

      <div id="app-panel" role="tabpanel" aria-labelledby={`app-tab-${tab}`} className="space-y-5">
        {tab === 'wallet' ? <WalletTab wallet={access.wallet} /> : tab === 'currency' ? <CurrencyTab /> : <LookTab />}
      </div>
    </div>
  )
}
