import { lazy, Suspense } from 'react'
import { ChunkErrorBoundary } from '../components/ChunkErrorBoundary'
import { stepIn, type RecordKind } from './lib/records'
import { useListedRecords, useRecords } from './lib/useRecords'
import type { RecordHostProps } from './ui/RecordPanel'

// Each record's panel is downloaded the first time one is opened.
const LeadRecordPanel = lazy(() => import('./leads/LeadRecord').then(m => ({ default: m.LeadRecordPanel })))
const ContactRecordPanel = lazy(() => import('./contacts/ContactRecord').then(m => ({ default: m.ContactRecordPanel })))
const CompanyRecordPanel = lazy(() => import('./contacts/CompanyRecord').then(m => ({ default: m.CompanyRecordPanel })))

const PANELS: Record<RecordKind, typeof LeadRecordPanel> = { lead: LeadRecordPanel, contact: ContactRecordPanel, company: CompanyRecordPanel }

/**
 * Round 5: the record the address opens (`?lead=`, `?contact=`, `?company=`), in a panel over whichever page it was
 * opened on. Previous and next walk the list that page registered (`useRecordList`).
 */
export function RecordHost() {
  const records = useRecords()
  const open = records.current
  const listed = useListedRecords(open?.kind ?? 'lead')
  if (!open) return null
  const Panel = PANELS[open.kind]
  const step = (dir: -1 | 1) => {
    const id = stepIn(listed, open.id, dir)
    return id === null ? null : () => records.open(open.kind, id, open.tab)
  }
  const props: RecordHostProps = {
    id: open.id, tab: open.tab, onTab: records.setTab, onClose: records.close, onPrev: step(-1), onNext: step(1),
  }
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={null}>
        <Panel key={`${open.kind}-${open.id}`} {...props} />
      </Suspense>
    </ChunkErrorBoundary>
  )
}
