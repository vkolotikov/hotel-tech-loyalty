/**
 * Compact freshness chip used in the leads list + pipeline cards.
 *
 * Logic extracted from the inline `ageChip` block that used to live in
 * Inquiries.tsx (and was duplicated in two kanban variants). Three states:
 *
 *   • `< 24h`                                      → "Fresh"  (emerald)
 *   • `>= 7 days since contact` OR `>= 7d old + no contact` → "Cold Nd" (amber)
 *   • everything in between                        → "Nd old" (gray)
 *
 * Stages of kind 'won' / 'lost' don't display a chip — closed leads aren't
 * useful to flag as "Cold". Pass `hideForClosed` to suppress.
 */

export interface FreshnessBadgeProps {
  /** ISO timestamp the lead was created (sets the floor for "fresh"). */
  createdAt?: string | null
  /** ISO timestamp of the most recent staff outreach (drives the "cold" trigger). */
  lastContactedAt?: string | null
  /**
   * When true, the pipeline_stage.kind is treated as terminal and the chip
   * collapses to null. Pass for any inquiry where you only want freshness
   * signal on open leads.
   */
  isClosed?: boolean
  /** Tightens padding for use inside dense kanban cards. */
  size?: 'sm' | 'md'
  /** Optional translation function (t) so the chip can be localised. Falls back to English. */
  t?: (key: string, opts?: any) => string
}

interface Resolved {
  label: string
  cls: string
  title: string
}

function resolve(props: FreshnessBadgeProps): Resolved | null {
  const { createdAt, lastContactedAt, isClosed, t } = props
  if (isClosed || !createdAt) return null

  const created = new Date(createdAt).getTime()
  if (!Number.isFinite(created)) return null
  const ageDays = Math.floor((Date.now() - created) / 86_400_000)

  const lastContact = lastContactedAt ? new Date(lastContactedAt).getTime() : null
  const daysSinceContact = lastContact && Number.isFinite(lastContact)
    ? Math.floor((Date.now() - lastContact) / 86_400_000)
    : null

  const tr = t ?? ((_k: string, opts?: any) => opts?.defaultValue ?? '')
  const titleFresh = 'Created in the last 24 hours'
  const titleCold = 'No staff outreach in 7+ days — needs nurturing'
  const titleAge = 'Days since this lead was created'

  if (ageDays < 1) {
    return {
      label: tr('inquiries.row.age_fresh', { defaultValue: 'Fresh' }),
      cls: 'text-emerald-300/90 bg-emerald-500/10 border-emerald-500/25',
      title: titleFresh,
    }
  }
  if ((daysSinceContact === null && ageDays >= 7) || (daysSinceContact !== null && daysSinceContact >= 7)) {
    const d = daysSinceContact ?? ageDays
    return {
      label: tr('inquiries.row.age_cold', { d, defaultValue: `Cold ${d}d` }),
      cls: 'text-amber-300/95 bg-amber-500/12 border-amber-500/30',
      title: titleCold,
    }
  }
  return {
    label: tr('inquiries.row.age_days', { d: ageDays, defaultValue: `${ageDays}d old` }),
    cls: 'text-gray-400 bg-white/[0.04] border-white/10',
    title: titleAge,
  }
}

export default function FreshnessBadge(props: FreshnessBadgeProps) {
  const r = resolve(props)
  if (!r) return null
  const tight = props.size === 'sm'
  return (
    <span
      title={r.title}
      className={[
        'flex-shrink-0 inline-flex items-center font-bold uppercase tracking-wider border rounded',
        tight ? 'text-[8.5px] px-1 py-[1px]' : 'text-[9px] px-1.5 py-0.5',
        r.cls,
      ].join(' ')}
    >
      {r.label}
    </span>
  )
}
