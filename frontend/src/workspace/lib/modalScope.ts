/** One stack for nested modals. Only the uppermost scope traps focus and owns Escape. */
const scopes: HTMLElement[] = []
const hidden = new Map<HTMLElement, boolean>()
const focusable = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
const visible = (element: HTMLElement) => !element.closest('[hidden], [inert]') && element.getClientRects().length > 0
function cover() {
  hidden.forEach((was, element) => { element.inert = was })
  hidden.clear()
  const top = scopes.at(-1)
  if (!top) return
  let branch: HTMLElement = top
  while (branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling !== branch && sibling instanceof HTMLElement) { hidden.set(sibling, sibling.inert); sibling.inert = true }
    }
    branch = branch.parentElement
  }
}
export function modalScope(element: HTMLElement, escape: () => void, { afterChildren = false } = {}) {
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
  // A resize may turn a dock into a modal while its child dialog is already open.
  const child = scopes.findIndex(scope => element.contains(scope))
  scopes.splice(child < 0 ? scopes.length : child, 0, element)
  cover()
  if (scopes.at(-1) === element) element.focus()
  const key = (event: KeyboardEvent) => {
    if (scopes.at(-1) !== element || event.defaultPrevented) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); escape(); return }
    if (event.key !== 'Tab') return
    const items = [...element.querySelectorAll<HTMLElement>(focusable)].filter(item => item.tabIndex >= 0 && visible(item))
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (!items.length || index < 0 || (!event.shiftKey && index === items.length - 1) || (event.shiftKey && index === 0)) {
      event.preventDefault()
      ;(event.shiftKey ? items.at(-1) : items[0] ?? element)?.focus()
      if (!items.length) element.focus()
    }
  }
  const focus = (event: FocusEvent) => { if (scopes.at(-1) === element && !element.contains(event.target as Node)) element.focus() }
  window.addEventListener('keydown', key, !afterChildren)
  document.addEventListener('focusin', focus)
  return () => {
    window.removeEventListener('keydown', key, !afterChildren)
    document.removeEventListener('focusin', focus)
    const index = scopes.indexOf(element)
    if (index >= 0) scopes.splice(index, 1)
    cover()
    if (before?.isConnected && !before.closest('[inert]')) before.focus()
    else scopes.at(-1)?.focus()
  }
}
