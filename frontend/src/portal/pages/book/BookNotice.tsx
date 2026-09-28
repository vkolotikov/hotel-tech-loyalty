import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { bookErrorFallback, bookErrorKey } from '../../lib/portalApi'
import { Notice } from '../../ui/Notice'

/**
 * The sentence `Book.tsx` shows above whichever step a `confirm()` error bounced the member back to (see
 * `steps.ts`'s `afterConfirmError`). Extracted into its own component so it's testable on its own —
 * reaching this state through the full flow needs a real Stripe interaction and a server error, which
 * `renderToStaticMarkup` can't drive; this piece only needs a code.
 */
export function BookNotice({ code, ref }: { code: string | null; ref?: Ref<HTMLDivElement> }) {
  const { t } = useTranslation()
  if (code === null) return null
  // `tabIndex={-1}`: Book moves focus here after a bounce (steps.ts's `focusTargetFor`), outside the tab order.
  return <Notice tone="warning" tabIndex={-1} ref={ref}>{t(bookErrorKey(code), bookErrorFallback(code))}</Notice>
}
