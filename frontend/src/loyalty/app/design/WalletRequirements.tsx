import { useCardWords } from './words'

/** Provider approval is separate from the server's local credential-presence flags. */
export function WalletRequirements() {
  const say = useCardWords()
  return <section className="l-ov-panel l-ca-panel l-ca-requirements" aria-label={say('walletRequirements')}>
    <h2>{say('walletRequirements')}</h2><p>{say('walletOwnerSetup')}</p>
    <details><summary>{say('providerRequirements')}</summary><dl>
      <dt>{say('apple')}</dt><dd>{say('appleRequirements')}</dd>
      <dt>{say('google')}</dt><dd>{say('googleRequirements')}</dd>
    </dl><p>{say('walletApproval')}</p></details>
  </section>
}
