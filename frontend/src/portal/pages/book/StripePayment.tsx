import { useEffect, useMemo, useRef, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { Appearance } from '@stripe/stripe-js'
import { Button } from '../../ui/Button'
import { Notice } from '../../ui/Notice'
import { stripeAppearance, stripeFor } from '../../lib/stripe'
import { payOutcome, type PayResult } from './payOutcome'

interface Props {
  clientSecret: string
  publishableKey: string
  /** Called the instant the member presses Pay, before Stripe has answered at all — `PayStep` uses this to
   *  engage the step-strip lock right away rather than only once a card is actually captured (fix round 2,
   *  finding M3): otherwise the strip stays clickable for the whole round-trip Stripe needs to answer. */
  onPayStart: () => void
  /** Called when Stripe answers with an error, or with a status that isn't a capture/success — releases
   *  the lock `onPayStart` engaged, since no card ended up held after all. */
  onPayFailed: () => void
  onPaid: (paymentIntentId: string) => void
  payLabel: string
  /** Both sentences come from `PayStep` (already translated via `t()`) rather than being hard-coded here —
   *  this component stays free of `useTranslation` and every string a member can see lives in one bundle. */
  paymentFailedMessage: string
  paymentIncompleteMessage: string
}

/**
 * Stripe's Payment Element, painted in the portal's own colours; only ever loaded on the Pay step (see the
 * `lazy()` wrapper in `PayStep.tsx`), so this chunk is never fetched for an at-venue booking.
 *
 * The DOM is read only inside the effect below, never during render: `stripeAppearance()` needs the
 * portal root's computed style, but computing it while rendering (e.g. inside a `useMemo` callback) would
 * read the DOM mid-render, which the light/dark check can't yet answer correctly on the very first paint
 * anyway. The effect runs once, right after mount, and updates the appearance Stripe's `Elements` already
 * knows how to pick up live — a deliberate, one-time sync from an external system (the DOM) into state,
 * not the "derive it during render instead" case `react-hooks/set-state-in-effect` is written to catch.
 */
export default function StripePayment({ clientSecret, publishableKey, onPayStart, onPayFailed, onPaid, payLabel, paymentFailedMessage, paymentIncompleteMessage }: Props) {
  const stripePromise = useMemo(() => stripeFor(publishableKey), [publishableKey])
  const [appearance, setAppearance] = useState<Appearance>(() => stripeAppearance(null, false))
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-portal]')
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const dark = root?.dataset.portalTheme === 'dark' || (root?.dataset.portalTheme !== 'light' && mq.matches)
    // Reading the DOM at all (see the doc comment above) has to happen in an effect, not during render;
    // this is the one-time result of that read, not state that could have been derived from props/state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAppearance(stripeAppearance(root, dark))
  }, [])
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <PayForm onPayStart={onPayStart} onPayFailed={onPayFailed} onPaid={onPaid} payLabel={payLabel} paymentFailedMessage={paymentFailedMessage} paymentIncompleteMessage={paymentIncompleteMessage} />
    </Elements>
  )
}

function PayForm({ onPayStart, onPayFailed, onPaid, payLabel, paymentFailedMessage, paymentIncompleteMessage }: {
  onPayStart: () => void
  onPayFailed: () => void
  onPaid: (id: string) => void
  payLabel: string
  paymentFailedMessage: string
  paymentIncompleteMessage: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Once a payment intent has actually been captured/succeeded, the button never re-enables — even if this
  // component somehow stayed mounted a moment longer, there is no route back to asking the member to pay
  // for the same booking a second time (see the minor finding on this in fix round 1).
  const [paid, setPaid] = useState(false)
  // Written in both halves of the effect below, never during render (react-hooks v7 flags reading/writing
  // a ref mid-render) — read after `await`ing Stripe, so a callback that resolves after the member has
  // somehow left this screen (a shell nav tap outside the Book flow's own step-strip lock, say) doesn't
  // call back into state setters or props of a component that no longer exists (fix round 2, finding M3).
  //
  // The setup ALSO sets `mounted.current = true`, not only the cleanup setting it `false` — under
  // `<StrictMode>` (React 19.2, and this app renders inside it) development runs setup, then cleanup, then
  // setup again for every effect, specifically to catch an effect whose cleanup isn't undone by a second
  // setup. Setting only `useRef(true)`'s initial value and never reasserting it in the setup body means
  // that second setup leaves the ref exactly where the FIRST cleanup left it: `false` — so `mounted.current`
  // reads `false` from the very first real interaction onward, and `pay()` returns right after Stripe
  // answers on every single attempt: `onPaid` never fires (the authorised card is never sent to confirm),
  // `onPayFailed` never fires (the strip stays locked forever), `busy` never clears. Reasserting `true` in
  // the setup makes the double-invoke sequence (setup → cleanup → setup) end exactly where a single mount
  // would: `true` — provably, since it's the same three-line sequence either way.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const pay = async () => {
    if (!stripe || !elements || paid) return
    onPayStart()
    setBusy(true)
    setError(null)
    let result: PayResult
    try {
      result = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: window.location.href } })
    } catch (e) {
      // Stripe's real result is typed to always resolve, never reject — but if it ever does (fix round 3,
      // minor C), treat it exactly like a returned `{ error }`, not as an unhandled rejection that leaves
      // `held`/`busy` stuck.
      result = { error: { message: e instanceof Error ? e.message : null } }
    }
    if (!mounted.current) return
    setBusy(false)
    const outcome = payOutcome(result)
    if (outcome.kind === 'paid') {
      setPaid(true)
      onPaid(outcome.id)
    } else if (outcome.kind === 'failed') {
      // Stripe's own message is already localized by Stripe; only fall back to our own sentence when
      // Stripe didn't provide one.
      setError(outcome.message ?? paymentFailedMessage)
      onPayFailed()
    } else {
      setError(paymentIncompleteMessage)
      onPayFailed()
    }
  }

  return (
    <div className="space-y-3">
      <PaymentElement onReady={() => setReady(true)} />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button type="button" full disabled={!ready || paid} loading={busy} onClick={() => { void pay() }}>{payLabel}</Button>
    </div>
  )
}
