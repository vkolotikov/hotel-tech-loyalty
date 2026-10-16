/** A menu's element, or anything that answers `contains` the same way. */
type Box = { contains(node: Node | null): boolean }

/** Whether a press or a focus at `target` falls outside the menu (it then closes). */
export const outside = (menu: Box | null, target: EventTarget | null): boolean => menu !== null && !menu.contains(target as Node | null)

/** Whether the focus was in the menu (a keyboard pick or Escape there): it then goes back to the menu's button. */
export const focusWasInside = (menu: Box | null, active: Element | null): boolean => menu !== null && active !== null && menu.contains(active)
