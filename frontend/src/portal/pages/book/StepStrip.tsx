export interface StepStripProps<S extends string> {
  steps: S[]
  current: S
  labels: Record<S, string>
  ariaLabel: string
  /** True while a card is held against an unconfirmed booking (`!canLeavePay(visit)` — see `steps.ts`) —
   *  every earlier step's button is disabled, with `aria-disabled` and no click handler, rather than let
   *  the member navigate away from an authorised, un-booked charge with no way back to it. */
  locked: boolean
  onJump: (step: S) => void
}

/**
 * The breadcrumb above the Book flow — generic over the step name so the stay flow's own steps can reuse
 * it too, not just the service flow's `Step`. Extracted from `Book.tsx` so it can be rendered and tested on
 * its own — in particular, that it disables every earlier step while `locked`, which is only reachable in
 * the full flow by actually holding a card through a real Stripe interaction that `renderToStaticMarkup`
 * can't drive.
 */
export function StepStrip<S extends string>({ steps, current, labels, ariaLabel, locked, onJump }: StepStripProps<S>) {
  const idx = steps.indexOf(current)
  return (
    <ol className="flex items-center gap-3 text-sm overflow-x-auto" aria-label={ariaLabel}>
      {steps.map((s, i) => (
        <li key={s} aria-current={s === current ? 'step' : undefined} className={s === current ? 'font-semibold text-p-text' : 'text-p-text-2'}>
          {i < idx ? (
            <button
              type="button"
              aria-disabled={locked || undefined}
              disabled={locked}
              onClick={locked ? undefined : () => onJump(s)}
              className="inline-flex items-center p-tap underline-offset-2 hover:underline disabled:no-underline disabled:pointer-events-none disabled:opacity-60"
            >
              {labels[s]}
            </button>
          ) : labels[s]}
        </li>
      ))}
    </ol>
  )
}
