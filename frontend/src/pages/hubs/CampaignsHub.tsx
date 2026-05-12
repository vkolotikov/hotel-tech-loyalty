import { lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mail, History, Send, Users as UsersIcon } from 'lucide-react'
import { format } from 'date-fns'
import { api } from '../../lib/api'
import { Card } from '../../components/ui/Card'
import { HubTabs } from '../../components/HubTabs'

const EmailCampaigns = lazy(() => import('../EmailCampaigns').then(m => ({ default: m.EmailCampaigns })))

const fallback = <div className="text-center text-[#636366] py-8 text-sm">Loading…</div>

/**
 * Read-only history of every member-broadcast that touched any
 * channel — bulk push, segment campaign, email campaign. Reads
 * from the existing audit_log table (no new schema) so the surface
 * is "what did we send" without requiring per-channel telemetry.
 */
function PushHistory() {
  const actions = [
    'members_bulk_message',
    'segment_campaign_sent',
    'email_campaign_sent',
  ]

  const { data, isLoading } = useQuery({
    queryKey: ['admin-broadcast-history'],
    queryFn: async () => {
      const all: any[] = []
      for (const a of actions) {
        const r = await api.get('/v1/admin/audit-logs', { params: { action: a, per_page: 25 } })
        all.push(...(r.data?.data ?? []))
      }
      all.sort((x: any, y: any) =>
        new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
      )
      return all.slice(0, 50)
    },
  })

  const rows: any[] = data ?? []

  return (
    <Card>
      {isLoading ? (
        <p className="text-center text-[#636366] py-8 text-sm">Loading history…</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-12">
          <History size={32} className="mx-auto text-[#636366] mb-3" />
          <p className="text-[#636366] text-sm">
            No broadcasts sent yet. Once you send a push from Members or a campaign from the Email tab,
            they'll appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-t-secondary border-b border-dark-border">
                <th className="pb-3 font-medium">Channel</th>
                <th className="pb-3 font-medium">What</th>
                <th className="pb-3 font-medium text-right">Recipients</th>
                <th className="pb-3 font-medium text-right">Delivered</th>
                <th className="pb-3 font-medium">Sent by</th>
                <th className="pb-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {rows.map((r) => {
                const meta = r.metadata ?? {}
                const isEmail = r.action === 'email_campaign_sent'
                const recipients = meta.recipients ?? meta.recipient_count ?? meta.sent ?? 0
                const sent = meta.push_sent ?? meta.sent ?? meta.email_sent ?? meta.sent_count ?? recipients
                return (
                  <tr key={r.id} className="hover:bg-dark-surface2">
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {isEmail ? <Mail size={12} className="text-blue-400" /> : <Send size={12} className="text-amber-400" />}
                        <span className="text-white">{channelLabel(r.action)}</span>
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="text-white text-sm">{meta.title || meta.name || r.description || '—'}</div>
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="inline-flex items-center gap-1 text-[#a0a0a0]">
                        <UsersIcon size={11} />
                        {Number(recipients).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-white font-semibold">{Number(sent).toLocaleString()}</td>
                    <td className="py-2.5 text-xs text-t-secondary">{r.causer_name ?? '—'}</td>
                    <td className="py-2.5 text-xs text-t-secondary">{format(new Date(r.created_at), 'MMM d, HH:mm')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function channelLabel(action: string): string {
  switch (action) {
    case 'members_bulk_message':  return 'Bulk push'
    case 'segment_campaign_sent': return 'Segment push'
    case 'email_campaign_sent':   return 'Email campaign'
    default: return action
  }
}

export function CampaignsHub() {
  return (
    <HubTabs
      title="Campaigns"
      subtitle="Outreach to your members across push + email channels."
      tabs={[
        {
          key: 'email',
          label: 'Email campaigns',
          icon: <Mail size={15} />,
          description: 'Compose, save, then send rich emails to a saved segment.',
          render: () => <Suspense fallback={fallback}><EmailCampaigns /></Suspense>,
        },
        {
          key: 'history',
          label: 'Send history',
          icon: <History size={15} />,
          description: 'Every broadcast that touched any channel — push or email.',
          render: () => <PushHistory />,
        },
      ]}
    />
  )
}
