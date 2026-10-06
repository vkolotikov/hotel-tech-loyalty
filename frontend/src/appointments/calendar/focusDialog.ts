/**
 * Moves the focus into a dialog that just opened — onto the dialog itself,
 * since its Save may still be disabled — and brings it into view (the drop
 * confirm opens under the card, possibly below the fold). The returned
 * function gives the focus back to where it was, if that is still on the page.
 */
export function focusDialog(
  box: { focus: (options?: FocusOptions) => void; scrollIntoView: (options?: ScrollIntoViewOptions) => void },
  before: { isConnected: boolean; focus: () => void } | null,
): () => void {
  box.focus({ preventScroll: true })
  box.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  return () => { if (before?.isConnected) before.focus() }
}
