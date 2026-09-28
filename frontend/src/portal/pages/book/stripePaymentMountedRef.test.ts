import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * `StripePayment.tsx`'s `mounted` ref has no way to be exercised by a render-level test — there is no
 * mount/unmount cycle, and no `<StrictMode>` double-invoke, under `renderToStaticMarkup`. This reads the
 * source directly instead (same technique as `tokens.test.ts`'s sweep) and asserts the specific shape fix
 * round 3's finding required: the effect's SETUP must reassert `mounted.current = true`, not only its
 * cleanup setting it `false`.
 *
 * Why this matters: under `<StrictMode>` (React 19.2; this app renders inside it), development runs an
 * effect's setup, then its cleanup, then its setup again, for every effect, on every real mount — precisely
 * to catch an effect whose cleanup isn't undone by a second setup. A setup that never reassigns
 * `mounted.current` leaves it exactly where the FIRST cleanup left it — `false` — from the very first real
 * interaction onward: every `pay()` call then returns right after Stripe answers, so `onPaid` never runs
 * (the authorised card is never sent to confirm), `onPayFailed` never runs (the step-strip lock never
 * releases), and `busy` never clears.
 */
const SOURCE = fs.readFileSync(path.join(__dirname, 'StripePayment.tsx'), 'utf8')

describe('StripePayment — the mounted-ref effect', () => {
  it('reasserts mounted.current = true in the effect SETUP, not only mounted.current = false in its cleanup', () => {
    const start = SOURCE.indexOf('const mounted = useRef')
    expect(start, 'StripePayment.tsx no longer declares `mounted` as a ref — update this test, not just this message').toBeGreaterThan(-1)
    const effectEnd = SOURCE.indexOf('}, [])', start)
    expect(effectEnd, "the mounted ref's own effect no longer closes with `}, [])` nearby — update this test").toBeGreaterThan(-1)
    const effectSource = SOURCE.slice(start, effectEnd)

    expect(effectSource).toMatch(/mounted\.current\s*=\s*true/)
    expect(effectSource).toMatch(/mounted\.current\s*=\s*false/)
  })
})
