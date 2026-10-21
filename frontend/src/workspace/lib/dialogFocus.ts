/**
 * Where Tab sends the focus in a modal: the first item after the last, the
 * last before the first (or before the dialog box itself, `active` null),
 * and back inside when the focus has left the dialog (its focused button
 * was replaced, as Generate's result replaces its form). null: let the
 * browser move it.
 */
export function trapTarget<T>(items: readonly T[], active: T | null, shift: boolean, inside: boolean): T | null {
  if (items.length === 0) return null
  const first = items[0]
  const last = items[items.length - 1]
  if (!inside) return shift ? last : first
  if (shift && (active === null || active === first)) return last
  if (!shift && active === last) return first
  return null
}
