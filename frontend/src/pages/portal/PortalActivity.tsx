import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { api } from '../../lib/api'

/**
 * Full points history — paginated, because a long-standing member's ledger
 * is not a list you render all of.
 *
 * Every row is a real ledger entry, including reversals and expiries, so a
 * member can reconcile their own balance rather than being shown a curated
 * subset that doesn't add up.
 */

interface Txn {
  id: number
  type: string
  points: number
  balance_after?: number | null
  description?: string | null
  created_at: string
  is_reversed?: boolean
}

interface Paginated {
  data: Txn[]
  current_page: number
  last_page: number
  total: number
}

const TYPE_LABEL: Record<string, string> = {
  earn: 'Earned',
  bonus: 'Bonus',
  redeem: 'Redeemed',
  adjust: 'Adjustment',
  expire: 'Expired',
  reverse: 'Reversed',
}

export function PortalActivity() {
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, refetch, isFetching } = useQuery<Paginated>({
    queryKey: ['portal-activity', page],
    queryFn: () => api.get('/v1/member/points/history', { params: { page, per_page: 20 } }).then(r => r.data),
    // Keeps the previous page on screen while the next loads, so paging
    // doesn't flash an empty list.
    placeholderData: keepPreviousData,
  })

  if (isLoading) {
    return <div className="flex justify-center py-20 text-t-secondary"><Loader2 className="animate-spin" size={22} /></div>
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-surface p-6 text-center">
        <p className="text-sm text-t-secondary mb-3">Couldn't load your activity.</p>
        <button onClick={() => refetch()} className="text-sm font-semibold text-primary-400">Try again</button>
      </div>
    )
  }

  const rows = data?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">Activity</h1>
        {!!data?.total && (
          <span className="text-xs text-t-secondary tabular-nums">{data.total.toLocaleString()} entries</span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dark-border bg-dark-surface p-8 text-center">
          <p className="text-sm text-t-secondary">
            No points activity yet. Your first visit will show up here.
          </p>
        </div>
      ) : (
        <ul className="rounded-xl border border-dark-border overflow-hidden divide-y divide-dark-border">
          {rows.map(t => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-dark-surface">
              <div className="min-w-0">
                <p className={`text-sm truncate ${t.is_reversed ? 'line-through text-t-secondary' : ''}`}>
                  {t.description || TYPE_LABEL[t.type] || t.type}
                </p>
                <p className="text-[11px] text-t-secondary">
                  {TYPE_LABEL[t.type] || t.type} ·{' '}
                  {new Date(t.created_at).toLocaleDateString(undefined, {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                  {t.is_reversed && ' · reversed'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className={`text-sm font-semibold tabular-nums ${
                  t.points >= 0 ? 'text-accent' : 'text-t-secondary'
                }`}>
                  {t.points >= 0 ? '+' : ''}{t.points.toLocaleString()}
                </span>
                {t.balance_after != null && (
                  <p className="text-[10px] text-t-secondary tabular-nums">
                    balance {t.balance_after.toLocaleString()}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {(data?.last_page ?? 1) > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || isFetching}
            className="px-3 py-1.5 text-sm rounded-lg border border-dark-border text-t-secondary
                       hover:text-white disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-t-secondary tabular-nums">
            Page {data?.current_page} of {data?.last_page}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= (data?.last_page ?? 1) || isFetching}
            className="px-3 py-1.5 text-sm rounded-lg border border-dark-border text-t-secondary
                       hover:text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
