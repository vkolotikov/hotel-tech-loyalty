/**
 * Focus handed back to where it was, when a panel or a dialog closes, is not
 * the keyboard moving there, even when the browser draws it as keyboard focus
 * (it does after an Escape). A calendar card opens its preview for the keyboard
 * only, so it asks, while its focus event runs, whether the focus was handed back.
 */
let receiving: unknown = null

/** Gives the focus back to `el` (nothing without one), known as handed back while its focus event runs. */
export function handBackFocus(el: { focus: (options?: FocusOptions) => void } | null | undefined, options?: FocusOptions): void {
  if (!el) return
  receiving = el
  try {
    el.focus(options)
  } finally {
    receiving = null
  }
}

/** True while `el` is receiving a focus handed back to it. */
export function isHandedBack(el: unknown): boolean {
  return el !== null && receiving === el
}
