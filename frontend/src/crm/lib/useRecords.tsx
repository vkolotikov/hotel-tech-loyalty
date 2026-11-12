import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  createOf, hrefOf, presetGuestOf, recordOf, withCreate, withRecord, withoutRecord,
  type CreateKind, type CreatePreset, type OpenRecord, type RecordKind,
} from './records'

/**
 * Round 5: opening a record or a "new" panel from anywhere in HexaTech CRM (the rules are `records.ts`). Opening pushes
 * the address, so Back closes the panel; changing a record's tab replaces it. A page that lists records says which
 * ones, in its order (`useRecordList`), so the panel can step to the one before or after.
 */

type Lists = Partial<Record<RecordKind, readonly number[]>>
const ListContext = createContext<{ lists: Lists; setList: (kind: RecordKind, ids: readonly number[]) => void } | null>(null)

export function RecordListProvider({ children }: { children: ReactNode }) {
  const [lists, setLists] = useState<Lists>({})
  const setList = useCallback((kind: RecordKind, ids: readonly number[]) => {
    setLists(prev => (prev[kind]?.join(',') === ids.join(',') ? prev : { ...prev, [kind]: ids }))
  }, [])
  const value = useMemo(() => ({ lists, setList }), [lists, setList])
  return <ListContext.Provider value={value}>{children}</ListContext.Provider>
}

/** Says which records the page shows, in its order, for the panel's previous and next. */
export function useRecordList(kind: RecordKind, ids: readonly number[]): void {
  const ctx = useContext(ListContext)
  const key = ids.join(',')
  useEffect(() => {
    ctx?.setList(kind, key ? key.split(',').map(Number) : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key])
}

/** The records the current page listed (for the panel). */
export function useListedRecords(kind: RecordKind): readonly number[] {
  return useContext(ListContext)?.lists[kind] ?? []
}

export interface Records {
  current: OpenRecord | null
  creating: CreateKind | null
  /** The contact the "new" panel was asked for (a lead for them), or null. */
  presetGuest: number | null
  open: (kind: RecordKind, id: number, tab?: string | null) => void
  /** Moves to another tab of the open record (replaces the address). */
  setTab: (tab: string) => void
  close: () => void
  href: (kind: RecordKind, id: number, tab?: string | null) => string
  create: (kind: CreateKind | null, preset?: CreatePreset) => void
  /** A link to a "new" panel over this page (Ctrl-click still works). */
  createHref: (kind: CreateKind, preset?: CreatePreset) => string
}

export function useRecords(): Records {
  const [search, setSearch] = useSearchParams()
  const { pathname } = useLocation()
  return {
    current: recordOf(search),
    creating: createOf(search),
    presetGuest: presetGuestOf(search),
    open: (kind, id, tab) => setSearch(prev => withRecord(prev, kind, id, tab)),
    setTab: tab => setSearch(prev => {
      const open = recordOf(prev)
      return open ? withRecord(prev, open.kind, open.id, tab) : prev
    }, { replace: true }),
    close: () => setSearch(prev => withoutRecord(prev)),
    href: (kind, id, tab) => hrefOf(pathname, withRecord(search, kind, id, tab)),
    create: (kind, preset) => setSearch(prev => withCreate(prev, kind, preset)),
    createHref: (kind, preset) => hrefOf(pathname, withCreate(search, kind, preset)),
  }
}
