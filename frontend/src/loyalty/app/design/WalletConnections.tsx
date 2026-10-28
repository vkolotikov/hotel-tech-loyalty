import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../../LoyaltyProvider'
import { failureOf } from '../../lib/api'
import { overviewScope } from '../../overview/overviewMath'
import { OverviewButton, OverviewRecovery, OverviewSkeleton } from '../../overview/OverviewUI'
import { DesignDialog } from '../../redesign/DesignUI'
import { WALLET_KEY, appApi } from '../api'
import { MISSING_WORDS } from '../words'
import { useCardWords } from './words'

export function WalletConnections() {
  const boot = useBoot(), say = useCardWords(), { t } = useTranslation()
  const [test, setTest] = useState<'apple' | 'google' | null>(null)
  const allowed = boot.staff.can.manage_app && boot.features.wallet
  const query = useQuery({ queryKey: [...WALLET_KEY, overviewScope(boot)], queryFn: appApi.wallet, enabled: allowed,
    retry: (count, error) => ![401, 402, 403].includes(failureOf(error).status) && count < 1 })
  const denied = [401, 402, 403].includes(failureOf(query.error).status)
  if (!allowed) return <div className="l-ov-panel l-ca-panel"><h2>{say('walletConnections')}</h2><p>{say('walletLocked')}</p></div>
  if (query.isError) return <OverviewRecovery forbidden={denied} title={say('walletUnavailable')} busy={query.isFetching} onRetry={() => { void query.refetch() }} />
  if (!query.data) return <OverviewSkeleton rows={2} />
  const wallet = query.data.wallet
  return <><div className="l-ca-wallets">{(['apple', 'google'] as const).map(provider => {
    const ready = wallet[`${provider}_ready`] && wallet.is_active, missing = wallet[`${provider}_missing`]
    return <section key={provider} className="l-ov-panel l-ca-panel" data-provider={provider} aria-label={say(provider)}>
      <div className="l-ca-wallet-heading"><h2>{say(provider)}</h2><span className="l-ca-status" data-ready={ready}>{say(ready ? 'ready' : !wallet.is_active ? 'off' : 'needsSetup')}</span></div>
      <p>{say('walletLine', { provider: say(provider) })}</p>
      <div className="l-ca-actions">{ready ? <><OverviewButton primary onClick={() => setTest(provider)}>{say('testDevice')}</OverviewButton><Link className="l-ov-button" to={`/loyalty/app?tab=wallet&provider=${provider}`}>{say('connectionSettings')}</Link></> : <><Link className="l-ov-button l-ov-primary" to={`/loyalty/app?tab=wallet&provider=${provider}`}>{say('setupConnection')}</Link><OverviewButton disabled>{say('testDevice')}</OverviewButton></>}</div>
      <Link className="l-ov-link" to={`/loyalty/app?tab=wallet&provider=${provider}`}>{say('advancedSettings')} →</Link>
      <small>{say(ready ? 'testGuidance' : 'connectFirst')}</small>
      {!ready && missing.length > 0 && <details><summary>{say('whatMissing')}</summary><ul>{missing.map(code => <li key={code}>{code in MISSING_WORDS ? t(`loyalty.app.missing.${code}`, MISSING_WORDS[code]) : say('additionalRequirement')}</li>)}</ul></details>}
    </section>
  })}</div>{test && <DesignDialog title={say('testTitle', { provider: say(test) })} onClose={() => setTest(null)}><div className="l-ca-dialog-copy"><p>{say('testNoSample')}</p><ol><li>{say('testStep1')}</li><li>{say('testStep2', { provider: say(test) })}</li><li>{say('testStep3')}</li></ol><p>{say('testNoWrite')}</p><OverviewButton onClick={() => setTest(null)}>{say('close')}</OverviewButton></div></DesignDialog>}</>
}
