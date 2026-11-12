import { lazy, Suspense, useState } from 'react'
import { ChunkErrorBoundary } from '../components/ChunkErrorBoundary'
import { useBoot } from './CrmProvider'
import { useRecords } from './lib/useRecords'
import type { LeadDraft } from './leads/leadLogic'

const LeadForm = lazy(() => import('./leads/LeadForm').then(m => ({ default: m.LeadForm })))
const CaptureDialog = lazy(() => import('./leads/CaptureDialog').then(m => ({ default: m.CaptureDialog })))
const NewContactPanel = lazy(() => import('./contacts/NewContactPanel').then(m => ({ default: m.NewContactPanel })))
const CompanyFormPanel = lazy(() => import('./contacts/CompanyForm').then(m => ({ default: m.CompanyFormPanel })))
const TaskForm = lazy(() => import('./tasks/TaskForm').then(m => ({ default: m.TaskForm })))

/**
 * Round 5 (owner 2026-11-12, "popups … nice flow"): something new is made in a panel over the page it was asked for on
 * (`?create=…`, from the header's New menu or a page's own button), and what was made opens in its record panel. A lead
 * from a message is read by the AI first (every staff member, `ai_capture`), then checked in the lead form.
 */
export function CreateHost() {
  const records = useRecords()
  const boot = useBoot()
  const kind = records.creating
  const [captured, setCaptured] = useState<LeadDraft | null>(null)
  if (!kind) return null
  const close = () => { setCaptured(null); records.create(null) }
  const fromMessage = kind === 'capture' || kind === 'deal_capture'
  const asDeal = kind === 'deal' || kind === 'deal_capture'

  let body = null
  if (fromMessage && boot.features.ai_capture && !captured) {
    body = <CaptureDialog deal={asDeal} onClose={close} onRead={setCaptured} />
  } else if (kind === 'lead' || kind === 'deal' || fromMessage) {
    body = <LeadForm deal={asDeal} initial={captured} onClose={close} />
  } else if (kind === 'contact') {
    body = <NewContactPanel onClose={close} onCreated={guest => records.open('contact', guest.id)} />
  } else if (kind === 'company') {
    body = <CompanyFormPanel onClose={close} onSaved={company => records.open('company', company.id)} />
  } else if (kind === 'task') {
    body = <TaskForm task={null} onClose={close} />
  }
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={null}>{body}</Suspense>
    </ChunkErrorBoundary>
  )
}
