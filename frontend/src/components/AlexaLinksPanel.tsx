import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, RefreshCw, Speaker, Unplug } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

export interface AlexaLink {
  id: number
  can_write: boolean
  linked_at: string | null
  last_used_at: string | null
}

export interface AlexaLinksResponse {
  enabled: boolean
  links: AlexaLink[]
}

interface PairingCode {
  code: string
  expires_in: number
}

const endpoint = '/v1/auth/voice-alexa'
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2'

/** Shows a code as separate digits, the way it has to be said to Alexa. */
function spaced(code: string): string {
  return code.split('').join(' ')
}

// Personal controls: unlinking must keep working after voice is switched off
// for the workspace, just as disconnecting ChatGPT does.
export function AlexaLinksPanel() {
  const userId = useAuthStore(state => state.user?.id)
  const queryClient = useQueryClient()
  const queryKey = ['voice-alexa-links', userId] as const
  const [pairing, setPairing] = useState<PairingCode | null>(null)

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<AlexaLinksResponse>(`${endpoint}/links`, { timeout: 15_000 }).then(r => r.data),
    enabled: !!userId,
    retry: false,
  })

  const refresh = () => void queryClient.invalidateQueries({ queryKey })

  const issue = useMutation({
    mutationFn: () => api.post<PairingCode>(`${endpoint}/pairing-code`).then(r => r.data),
    onSuccess: code => setPairing(code),
    onError: () => toast.error('Could not create a code. Try again.'),
  })

  const setNotes = useMutation({
    mutationFn: ({ id, canWrite }: { id: number; canWrite: boolean }) =>
      api.patch(`${endpoint}/links/${id}`, { can_write: canWrite }),
    onSuccess: (_, { canWrite }) => {
      refresh()
      toast.success(canWrite ? 'This Echo can now add notes' : 'This Echo can now only read')
    },
    onError: () => toast.error('Could not change that. Try again.'),
  })

  const unlink = useMutation({
    mutationFn: (id: number) => api.delete(`${endpoint}/links/${id}`),
    onSuccess: () => {
      refresh()
      toast.success('Echo unlinked')
    },
    onError: () => toast.error('Could not unlink. Try again.'),
  })

  const links = data?.links ?? []
  const enabled = data?.enabled === true
  const busy = setNotes.isPending || unlink.isPending

  return (
    <section aria-labelledby="alexa-links-heading" className="mt-6 overflow-hidden rounded-2xl border border-[#dde3e8] bg-[#f4f6f8] text-[#1b2a34]">
      <div className="flex items-center gap-3 border-b border-[#dde3e8] px-5 py-4">
        <Speaker size={19} className="shrink-0 text-[#54626e]" aria-hidden="true" />
        <h2 id="alexa-links-heading" className="min-w-0 flex-1 text-sm font-semibold">Amazon Echo</h2>
        <button type="button" onClick={() => void refetch()} disabled={isFetching || busy}
          aria-label="Refresh linked devices" title="Refresh linked devices"
          className={`rounded-lg p-2 text-[#54626e] hover:bg-[#eaeef2] disabled:opacity-50 ${focus}`}>
          <RefreshCw size={15} className={isFetching ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-4 px-5 py-5 text-sm leading-relaxed">
        <p className="text-[#54626e]">Ask Hexa-Tech questions out loud on an Echo. A linked Echo answers as you, so link only a device you control.</p>

        {isLoading ? (
          <p role="status" className="flex items-center gap-2 text-[#54626e]">
            <Loader2 size={15} className="motion-safe:animate-spin" aria-hidden="true" /> Loading linked devices…
          </p>
        ) : isError ? (
          <div role="alert" className="flex items-start gap-2 text-[#9c2f32]">
            <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p>Linked devices could not be loaded.</p>
              <button type="button" onClick={() => void refetch()} className={`mt-1 rounded underline underline-offset-2 ${focus}`}>Try again</button>
            </div>
          </div>
        ) : (
          <>
            {!enabled && (
              <p className="rounded-lg border border-[#dde3e8] bg-[#eaeef2] p-3 text-[#54626e]">
                Echo linking is unavailable for this workspace. You can still unlink devices linked earlier.
              </p>
            )}

            {links.length === 0 ? (
              <p className="font-medium">No linked Echo</p>
            ) : (
              <ul className="divide-y divide-[#dde3e8]" aria-label="Your linked Echo devices">
                {links.map(link => (
                  <li key={link.id} className="space-y-2 py-3 first:pt-0">
                    <div>
                      <p className="font-semibold">{link.can_write ? 'Can add notes' : 'Reads only'}</p>
                      {link.linked_at && (
                        <p className="mt-0.5 text-xs text-[#54626e]">Linked {new Date(link.linked_at).toLocaleString()}</p>
                      )}
                      {link.last_used_at && (
                        <p className="text-xs text-[#54626e]">Last used {new Date(link.last_used_at).toLocaleString()}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy}
                        onClick={() => setNotes.mutate({ id: link.id, canWrite: !link.can_write })}
                        className={`min-h-10 rounded-lg border border-[#bdc7ce] bg-white px-4 py-2 text-xs font-semibold hover:bg-[#eaeef2] disabled:opacity-60 ${focus}`}>
                        {link.can_write ? 'Stop notes from this Echo' : 'Allow notes from this Echo'}
                      </button>
                      <button type="button" disabled={busy} onClick={() => unlink.mutate(link.id)}
                        className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-[#9c2f32] hover:bg-[#eaeef2] disabled:opacity-60 ${focus}`}>
                        <Unplug size={15} aria-hidden="true" /> Unlink
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {enabled && (pairing ? (
              <div role="status" className="space-y-2 rounded-xl border border-[#dde3e8] bg-white p-4">
                <p className="font-medium">Say to your Echo:</p>
                <p>
                  “Alexa, open hexa”, then “link code{' '}
                  <span className="font-mono font-semibold tracking-widest">{spaced(pairing.code)}</span>”.
                </p>
                <p className="text-xs text-[#54626e]">
                  The code works once and expires in {Math.max(1, Math.round(pairing.expires_in / 60))} minutes.
                  Anyone who hears it could use it first, so say it where only you can be heard.
                </p>
                <button type="button" onClick={() => { setPairing(null); refresh() }}
                  className={`min-h-10 rounded-lg px-4 py-2 text-xs font-semibold hover:bg-[#eaeef2] ${focus}`}>Done</button>
              </div>
            ) : (
              <button type="button" onClick={() => issue.mutate()} disabled={issue.isPending}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#bdc7ce] bg-white px-4 py-2 text-xs font-semibold hover:bg-[#eaeef2] disabled:opacity-60 ${focus}`}>
                {issue.isPending && <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />}
                Link an Echo
              </button>
            ))}
          </>
        )}
      </div>
    </section>
  )
}
