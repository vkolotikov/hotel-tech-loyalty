import { useEffect, useState } from 'react'
import { SearchInput } from '../ui/inputs'

/** A search box whose address follows the typing after a short pause, so each key is not a request. */
export function SearchBox({ label, value, onSearch }: { label: string; value: string; onSearch: (value: string | null) => void }) {
  const [text, setText] = useState(value)
  const [seen, setSeen] = useState(value)
  // The address changed by itself (Clear filters, a saved view, Back): show what it says now.
  if (seen !== value) {
    setSeen(value)
    setText(value)
  }
  useEffect(() => {
    if (text.trim() === value.trim()) return undefined
    const timer = window.setTimeout(() => onSearch(text.trim() || null), 350)
    return () => window.clearTimeout(timer)
  }, [text, value, onSearch])
  return <SearchInput label={label} value={text} onChange={setText} />
}
