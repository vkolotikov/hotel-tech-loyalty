/**
 * Leave the workspace ("Full admin", Sign out) unless it says no: these exits
 * unload no page the browser could ask about, and Sign out revokes the
 * session first. `onLeave` asks (true: go); `e` is the link's click, stopped
 * when staying.
 */
export function leave(onLeave: (() => boolean) | undefined, go: () => void, e?: { preventDefault: () => void }): void {
  if (onLeave && !onLeave()) {
    e?.preventDefault()
    return
  }
  go()
}
