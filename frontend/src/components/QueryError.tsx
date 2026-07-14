import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Inline error state for failed list queries. Before this existed,
 * pages destructured only { data, isLoading } — a 500/timeout rendered
 * as "No members yet" / an empty table, indistinguishable from a
 * genuinely empty program (an admin could conclude their tier config
 * was wiped and start rebuilding it). Render this when `isError` is
 * true and pass the query's `refetch` for the retry affordance.
 */
export function QueryError({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useTranslation()
  return (
    <div className="text-center py-14 bg-dark-surface border border-red-500/25 rounded-xl">
      <AlertCircle size={30} className="mx-auto mb-3 text-red-400/70" />
      <p className="text-sm text-red-300">
        {message ?? t('common.load_failed', "Couldn't load this data. The server may be briefly unavailable.")}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-xs text-primary-400 hover:text-primary-300 font-semibold"
        >
          {t('common.retry', 'Try again')}
        </button>
      )}
    </div>
  )
}
