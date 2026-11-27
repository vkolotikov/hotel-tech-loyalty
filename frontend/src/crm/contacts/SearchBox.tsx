import { useListSearch } from '../lib/useListSearch'
import { SearchInput } from '../ui/inputs'

/** A search box whose address follows the typing after a short pause, so each key is not a request. */
export function SearchBox({ label, placeholder, value, onSearch }: { label: string; placeholder?: string; value: string; onSearch: (value: string | null) => void }) {
  const [text, setText] = useListSearch(value, query => onSearch(query || null))
  return <SearchInput label={label} placeholder={placeholder} value={text} onChange={setText} />
}
