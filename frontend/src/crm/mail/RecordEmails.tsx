import { CrmEmailHistory, type MailTransport } from '../../components/CrmEmailHistory'
import { get, send } from '../lib/api'
import { brandParam } from '../lib/brand'
import { useSearchParams } from 'react-router-dom'

const refreshMethod = 'post'
const transport: MailTransport = { read: get, refresh: (path, data) => send(refreshMethod, path, data) }
export function RecordEmails({ resource, id }: { resource: 'guests' | 'inquiries'; id: number }) {
  const [search] = useSearchParams()
  const message = resource === 'inquiries' && Number(search.get('lead')) === id ? search.get('mail_message') : null
  const initial = message && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(message) ? message : null
  return <CrmEmailHistory key={`${resource}:${id}:${brandParam()}:${initial ?? ''}`} resource={resource} id={id} initialMessage={initial} transport={transport} scope={`crm:${brandParam()}`} />
}
