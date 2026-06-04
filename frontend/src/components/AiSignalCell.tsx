/**
 * Compact AI signal column for the leads list.
 *
 * Shows:
 *   • `ai_win_probability` as a 13px tabular number with a thin gauge bar
 *     underneath, color-coded to the same emerald / amber / red thresholds
 *     the InquiryDetail Smart Panel uses (≥70 / ≥40 / <40).
 *   • `ai_going_cold_risk === 'high'` → small Lucide `Flame` icon to the
 *     right of the percentage.
 *   • Hover anywhere on the cell → 320px floating popover with
 *     `ai_suggested_action` (one-liner) + a 3-line excerpt of `ai_brief`.
 *     Existing data, no new endpoint.
 *
 * Renders an empty fragment (no `—`, no chrome) when the row has no AI
 * data yet — for legacy rows this column stays visually quiet instead of
 * drawing attention to an empty cell.
 */

import { useRef, useState, useEffect } from 'react'
import { Flame, Sparkles } from 'lucide-react'

export interface AiSignalCellProps {
  /** ai_win_probability — 0..100 integer. Null = no AI data yet. */
  probability?: number | null
  /** ai_going_cold_risk — 'low' | 'medium' | 'high'. */
  coldRisk?: string | null
  /** ai_suggested_action — short single-line callout (~120 chars). */
  suggestedAction?: string | null
  /** ai_brief — multi-paragraph context the popover excerpts. */
  brief?: string | null
  /** ai_intent — e.g. 'booking_inquiry'. Renders as a fallback chip when only intent is present. */
  intent?: string | null
  /** Compact rendering for kanban cards. */
  size?: 'sm' | 'md'
}

function scoreTone(score: number | null | undefined): {
  num: string
  bar: string
  ring: string
} {
  if (score == null) return { num: 'text-gray-500', bar: 'bg-gray-600', ring: 'border-gray-600' }
  if (score >= 70) return { num: 'text-emerald-300', bar: 'bg-emerald-400', ring: 'border-emerald-500/40' }
  if (score >= 40) return { num: 'text-amber-300', bar: 'bg-amber-400', ring: 'border-amber-500/40' }
  return { num: 'text-red-300', bar: 'bg-red-400', ring: 'border-red-500/40' }
}

export default function AiSignalCell({
  probability,
  coldRisk,
  suggestedAction,
  brief,
  intent,
  size = 'md',
}: AiSignalCellProps) {
  const [open, setOpen] = useState(false)
  const cellRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click — helps when popover stays open after focus
  // moves to a stage menu or row drawer.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (cellRef.current && !cellRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  // Nothing to show — keep the cell visually quiet.
  const hasAnyAi = probability != null || coldRisk || suggestedAction || brief || intent
  if (!hasAnyAi) return null

  const tone = scoreTone(probability)
  const tight = size === 'sm'
  const showFlame = (coldRisk ?? '').toLowerCase() === 'high'
  const showFreezing = (coldRisk ?? '').toLowerCase() === 'medium'

  return (
    <div
      ref={cellRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
      className="relative inline-flex flex-col gap-1 cursor-help select-none"
      data-row-noopen
    >
      {probability != null ? (
        <>
          <div className="flex items-center gap-1">
            <span className={[
              'font-bold tabular-nums leading-none',
              tight ? 'text-[11px]' : 'text-[13px]',
              tone.num,
            ].join(' ')}>
              {probability}%
            </span>
            {showFlame && (
              <Flame
                size={tight ? 10 : 12}
                className="text-red-400 drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]"
                aria-label="High going-cold risk"
              />
            )}
            {showFreezing && !showFlame && (
              <span title="Medium going-cold risk" className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </div>
          <div className="w-12 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={['h-full rounded-full transition-all', tone.bar].join(' ')}
              style={{ width: `${Math.max(2, Math.min(100, probability))}%` }}
            />
          </div>
        </>
      ) : (
        // No probability score but we have something to say — render an
        // intent / cold-risk chip so the cell isn't empty for rows that
        // got partial AI runs.
        <div className="inline-flex items-center gap-1">
          {showFlame && <Flame size={12} className="text-red-400" />}
          {intent && (
            <span className="text-[9px] uppercase tracking-wider font-bold text-gray-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/10">
              {intent.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      )}

      {open && (suggestedAction || brief) && (
        <div
          className="absolute z-40 top-full left-0 mt-1.5 w-[300px] bg-dark-surface border border-dark-border rounded-xl shadow-2xl p-3 text-xs cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider font-bold text-primary-400">
            <Sparkles size={11} />
            AI signal
          </div>
          {suggestedAction && (
            <div className="text-primary-300 italic leading-snug mb-2">
              {suggestedAction}
            </div>
          )}
          {brief && (
            <div className="text-gray-300 leading-relaxed line-clamp-4">
              {brief}
            </div>
          )}
          {probability != null && (
            <div className="mt-2 pt-2 border-t border-dark-border flex items-center gap-3 text-[10px] text-gray-500">
              <span><span className={tone.num + ' font-bold'}>{probability}%</span> win probability</span>
              {coldRisk && <span>· {coldRisk} cold-risk</span>}
              {intent && <span>· {intent.replace(/_/g, ' ')}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
