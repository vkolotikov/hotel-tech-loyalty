import { Briefcase } from 'lucide-react'
import { useBrandStore } from '../stores/brandStore'

/**
 * Tiny chip showing which brand a row originated from. Used on org-level
 * lists (Inquiries, Reservations, ChatInbox, etc.) to give admins at-a-
 * glance attribution when "All brands" is selected.
 *
 * Hidden when:
 *   - the org has only one brand (chip would be redundant noise)
 *   - the row's brand_id is null (e.g. legacy data not yet backfilled, or
 *     an intentionally org-wide row like an "all brands" offer)
 *
 * Renders as a low-key inline pill — name only, with the brand's primary
 * colour as a thin left border so different brands are quickly
 * distinguishable in a long table.
 */
export function BrandBadge({ brandId }: { brandId: number | null | undefined }) {
  const { brands } = useBrandStore()

  if (!brandId) return null
  if (brands.length <= 1) return null

  const brand = brands.find(b => b.id === brandId)
  if (!brand) return null

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-dark-surface2 text-t-secondary"
      style={{
        borderLeft: `2px solid ${brand.primary_color ?? '#666'}`,
        paddingLeft: 6,
      }}
      title={`Brand: ${brand.name}`}
    >
      <Briefcase size={9} />
      {brand.name}
    </span>
  )
}
