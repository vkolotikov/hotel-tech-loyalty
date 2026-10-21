import { useTranslation } from 'react-i18next'
import type { RequestState } from '../lib/types'
import { REQUEST_STATE_WORDS } from '../lib/words'

/** A benefit request's state: its tone's dot and word over the tone's tint (theme/loyalty.css). */
export function RequestStateBadge({ state }: { state: RequestState }) {
  const { t } = useTranslation()
  return (
    <span data-state={state} className="l-st-tint l-st-text inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold">
      <span aria-hidden className="l-st-dot h-1.5 w-1.5 rounded-full" />
      {t(`loyalty.requests.state.${state}`, REQUEST_STATE_WORDS[state])}
    </span>
  )
}
