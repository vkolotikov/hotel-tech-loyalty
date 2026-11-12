import { CrmEmailHistory, type MailTransport } from '../../components/CrmEmailHistory'
import { get, send } from '../lib/api'
import { brandParam } from '../lib/brand'

const refreshMethod = 'post'
const transport: MailTransport = { read: get, refresh: (path, data) => send(refreshMethod, path, data) }
export function RecordEmails({ resource, id }: { resource: 'guests' | 'inquiries'; id: number }) {
  return <CrmEmailHistory key={`${resource}:${id}:${brandParam()}`} resource={resource} id={id} transport={transport} scope={`crm:${brandParam()}`} />
}
