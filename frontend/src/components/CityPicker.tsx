import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, MapPin, Search } from 'lucide-react'
import { api } from '../lib/api'
import { placeLabel, type Place } from '../lib/places'

/**
 * The Locations form's city field (2026-11-09): type and pick the city from Open-Meteo's places (the server's
 * `admin/properties/places`), which fills the city, the country and an empty time zone (`applyPlace`). Typing a city by
 * hand still works; picking one is what makes the dashboards' weather certain. A combobox: arrows move, Enter picks,
 * Escape closes.
 */
export function CityPicker({ value, onType, onPick }: { value: string; onType: (city: string) => void; onPick: (place: Place) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const listId = useId()

  // A search a moment after the last key, not on every key.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(value.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [value])

  const search = useQuery({
    queryKey: ['properties-places', query],
    queryFn: () => api.get<{ available: boolean; places: Place[] }>('/v1/admin/properties/places', { params: { q: query, lang: 'en' } }).then(r => r.data),
    enabled: open && query.length >= 2,
    staleTime: 10 * 60_000,
    retry: false,
  })
  const places = search.data?.places ?? []

  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [])

  const pick = (place: Place) => {
    onPick(place)
    setOpen(false)
  }

  return (
    <div ref={box} className="relative">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-t-muted" aria-hidden="true" />
      <input
        value={value}
        onChange={e => { onType(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || places.length === 0) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(places.length - 1, a + 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
          if (e.key === 'Enter') { e.preventDefault(); pick(places[active]) }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="City — type to search"
        role="combobox"
        aria-expanded={open && places.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && places.length > 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className="w-full bg-dark-bg border border-dark-border rounded-lg pl-9 pr-8 py-2 text-white text-sm"
      />
      {search.isFetching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-t-muted" aria-hidden="true" />}
      {open && query.length >= 2 && !search.isFetching && search.data && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-dark-border bg-dark-surface2 py-1 shadow-lg">
          {places.length === 0 ? (
            <li className="px-3 py-2 text-xs text-t-muted">
              {search.data.available ? 'No city by that name. Check the spelling, or keep it as typed.' : 'The city search cannot be reached right now; the city is kept as typed.'}
            </li>
          ) : places.map((place, i) => (
            <li key={`${place.latitude},${place.longitude}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onPointerDown={e => { e.preventDefault(); pick(place) }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${i === active ? 'bg-dark-surface3 text-white' : 'text-t-secondary'}`}>
              <MapPin size={13} className="shrink-0 text-primary-400" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{placeLabel(place)}</span>
              {place.timezone && <span className="shrink-0 text-[11px] text-t-muted">{place.timezone}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
