import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Link2, Loader2, RefreshCw, Unplug } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

export interface ChatGptConnection {
  id: string
  name: string
  scopes: string[]
  created_at: string | null
  expires_at: string | null
}

export interface ChatGptConnectionsResponse {
  enabled?: boolean
  configured?: boolean
  connections: ChatGptConnection[]
}

const endpoint = '/v1/auth/plugin-connections'
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2'

export function ChatGptConnectionsPanel() {
  const userId = useAuthStore(state => state.user?.id)
  const queryClient = useQueryClient()
  const queryKey = ['chatgpt-connections', userId] as const
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<ChatGptConnectionsResponse>(endpoint, { timeout: 15_000 }).then(r => r.data),
    enabled: !!userId,
    retry: false,
  })

  const disconnect = useMutation({
    // Revoke the entire account grant set. Access-token IDs change during
    // refresh and cannot safely identify a persistent individual connection.
    mutationFn: () => api.delete(endpoint),
    onSuccess: () => {
      setConfirmDisconnect(false)
      queryClient.setQueryData<ChatGptConnectionsResponse>(queryKey, previous => ({
        ...previous, connections: [],
      }))
      void queryClient.invalidateQueries({ queryKey })
      toast.success('ChatGPT and Codex disconnected')
    },
    onError: () => toast.error('Could not disconnect. Try again.'),
  })

  const connections = data?.connections ?? []
  const linkingUnavailable = data?.enabled === false || data?.configured === false

  return (
    <section aria-labelledby="chatgpt-connections-heading" className="overflow-hidden rounded-2xl border border-[#dde3e8] bg-[#f4f6f8] text-[#1b2a34]">
      <div className="flex items-center gap-3 border-b border-[#dde3e8] px-5 py-4">
        <Link2 size={19} className="shrink-0 text-[#54626e]" aria-hidden="true" />
        <h2 id="chatgpt-connections-heading" className="min-w-0 flex-1 text-sm font-semibold">ChatGPT and Codex</h2>
        <button type="button" onClick={() => void refetch()} disabled={isFetching || disconnect.isPending}
          aria-label="Refresh connections" title="Refresh connections"
          className={`rounded-lg p-2 text-[#54626e] hover:bg-[#eaeef2] disabled:opacity-50 ${focus}`}>
          <RefreshCw size={15} className={isFetching ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-4 px-5 py-5 text-sm leading-relaxed">
        <p className="text-[#54626e]">Manage access you approved for this account. Disconnecting stops future access to your workspace.</p>

        {isLoading ? (
          <p role="status" className="flex items-center gap-2 text-[#54626e]">
            <Loader2 size={15} className="motion-safe:animate-spin" aria-hidden="true" /> Loading connections…
          </p>
        ) : isError ? (
          <div role="alert" className="flex items-start gap-2 text-[#9c2f32]">
            <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p>Connections could not be loaded.</p>
              <button type="button" onClick={() => void refetch()} className={`mt-1 rounded underline underline-offset-2 ${focus}`}>Try again</button>
            </div>
          </div>
        ) : (
          <>
            {linkingUnavailable && (
              <p className="rounded-lg border border-[#dde3e8] bg-[#eaeef2] p-3 text-[#54626e]">
                New connections are unavailable for this workspace. You can still disconnect earlier access.
              </p>
            )}
            {connections.length === 0 ? (
              <div className="space-y-1">
                <p className="font-medium">No connected access</p>
                {!linkingUnavailable && <p className="text-[#54626e]">To connect, start account linking in ChatGPT or Codex and approve access in Hexa-Tech.</p>}
              </div>
            ) : (
              <>
                <ul className="divide-y divide-[#dde3e8]" aria-label="Your approved connections">
                  {connections.map(connection => (
                    <li key={connection.id} className="py-3 first:pt-0">
                      <p className="break-words font-semibold">{connection.name}</p>
                      {connection.created_at && (
                        <p className="mt-0.5 text-xs text-[#54626e]">Authorized {new Date(connection.created_at).toLocaleString()}</p>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[#54626e]">Read CRM leads, customer and booking information, and add customer or booking notes within your staff permissions.</p>
                {confirmDisconnect ? (
                  <div className="space-y-3 rounded-xl border border-[#dde3e8] bg-white p-4">
                    <p className="font-medium">Disconnect all your ChatGPT and Codex access?</p>
                    <p className="text-xs text-[#54626e]">You can connect again by approving access. Information already shared in your chats remains there.</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}
                        className={`inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#9c2f32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#81272a] disabled:opacity-60 ${focus}`}>
                        {disconnect.isPending && <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />}
                        {disconnect.isPending ? 'Disconnecting…' : 'Disconnect all'}
                      </button>
                      <button type="button" onClick={() => setConfirmDisconnect(false)} disabled={disconnect.isPending}
                        className={`min-h-10 rounded-lg px-4 py-2 text-xs font-semibold hover:bg-[#eaeef2] disabled:opacity-60 ${focus}`}>Keep connected</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDisconnect(true)}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#bdc7ce] bg-white px-4 py-2 text-xs font-semibold hover:bg-[#eaeef2] ${focus}`}>
                    <Unplug size={15} aria-hidden="true" /> Disconnect ChatGPT and Codex
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
