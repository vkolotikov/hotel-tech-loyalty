import { useEffect, useEffectEvent, useState } from 'react'

/** Keep the typed text local until the pause ends, then update the current list view. */
export function useListSearch(value: string, commit: (text: string) => void) {
  const [text, setText] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setText(value)
  }
  const submit = useEffectEvent(commit)
  useEffect(() => {
    const query = text.trim()
    if (query === value.trim()) return
    const timer = window.setTimeout(() => submit(query), 350)
    return () => window.clearTimeout(timer)
  }, [text, value])
  return [text, setText] as const
}
