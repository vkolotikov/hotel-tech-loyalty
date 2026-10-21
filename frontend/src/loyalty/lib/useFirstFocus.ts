import { useEffect, useRef } from 'react'

/**
 * The field a dialog's work starts in, focused when the dialog opens. `autoFocus` cannot do it: the shared Dialog
 * focuses its own box in an effect, after React has applied `autoFocus`; this effect runs after the Dialog's (a parent's
 * effects run after its children's), as Content's quick capture does.
 */
export function useFirstFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return ref
}
