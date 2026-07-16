/**
 * Single inquiry / lead row for the modern Leads table.
 *
 * Extracts the ~270-line inline JSX block that lived in Inquiries.tsx
 * into a focused component, restyled per the v2 spec:
 *
 *   • 72px row height with subtle hover + selected backgrounds
 *   • Priority left-edge stripe (transparent for Medium so 70% of leads
 *     stay quiet)
 *   • IDENTITY column: avatar tinted by stage color + name + freshness
 *     chip + VIP chip + structured 2-line subtitle (company/property/
 *     brand, then masked email + phone). Contact actions float to the
 *     right and only appear on row hover.
 *   • STAGE column: a single inline-editable StageBadge. No more "Medium"
 *     plain text leaking out under the pill -- priority lives in the
 *     left stripe.
 *   • STAY / EVENT, VALUE (right-aligned, emerald pill), AI SIGNAL,
 *     NEXT ACTION, OWNER + SOURCE columns.
 *   • Trailing chevron + kebab, hover-revealed so the row reads clean
 *     at rest.
 *
 * Doesn't own the expand panel -- the parent renders the secondary
 * `<tr>` when `isExpanded` is true (it has too many heavy dependencies
 * on EditableField + mutations to live in here cleanly).
 */

import React from 'react'
import { ChevronDown, MoreHorizontal, Star, Mail, Phone, Globe } from 'lucide-react'

import { ContactActions } from './ContactActions'
import { BrandBadge } from './BrandBadge'
import FreshnessBadge from './FreshnessBadge'
import StageBadge from './StageBadge'
import AiSignalCell from './AiSignalCell'
import NextActionCell from './NextActionCell'

export interface SourceBadgeMeta {
  label: string
  cls: string
}

export interface LeadRowProps {
  inquiry: any
  fieldCfg: {
    list: {
      bulk_select: boolean
      stay: boolean
      value: boolean
      owner: boolean
      touches: boolean
      next_task: boolean
      country: boolean
      ai_signal: boolean
    }
  }
  listColumns: Array<{ id: string | number; key: string; label: string; type: string; help_text?: string | null }>
  renderCustomListValue: (type: string, v: any) => React.ReactNode
  sourceBadges: Record<string, SourceBadgeMeta>
  statusColors: Record<string, string>
  currencySymbol: string
  isSelected: boolean
  anySelected: boolean
  isExpanded: boolean

  onToggleSelect: () => void
  onToggleExpand: () => void
  onOpenStatusMenu: (rect: DOMRect) => void
  onOpenActionMenu: (rect: DOMRect) => void
  onOpenPriorityCycle: () => void   // cycles Low → Normal → Medium → High
  onOpenInquiryDrawer: () => void
  onAddTask: () => void

  t: (key: string, opts?: any) => string
}

/* Avatar initials from a full name. Handles single-word names ("Madonna")
 * by taking the first two letters. */
function initialsOf(name?: string | null): string {
  if (!name) return '·'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Internal — wrapped at the bottom in React.memo so the parent's 25-row
 * table doesn't re-render every row on every keystroke / 120s background
 * refetch. Without memoization Inquiries.tsx re-renders all 25 rows on
 * every parent state change because the parent passes 8 inline lambda
 * callbacks per row. See AUDIT-2026-06-13.md performance finding.
 */
function LeadRowImpl(props: LeadRowProps) {
  const {
    inquiry: inq, fieldCfg, listColumns, renderCustomListValue,
    sourceBadges, statusColors, currencySymbol,
    isSelected, anySelected, isExpanded,
    onToggleSelect, onToggleExpand,
    onOpenStatusMenu, onOpenActionMenu, onOpenPriorityCycle,
    onOpenInquiryDrawer, onAddTask, t,
  } = props

  /* ── Derived ── */
  const isOverdue =
    inq.next_task_due && !inq.next_task_completed && new Date(inq.next_task_due) < new Date()

  const isClosedKind = inq.pipeline_stage?.kind === 'won' || inq.pipeline_stage?.kind === 'lost'

  const stageColor: string | null = inq.pipeline_stage?.color ?? null
  const stageLabel: string =
    inq.pipeline_stage?.name ?? inq.status ?? t('inquiries.row.unknown_stage', { defaultValue: 'Unknown' })

  // Priority left-edge stripe (3px). Medium = transparent (default), only
  // High and Low get marked so the visual is meaningful.
  const priorityStripe = inq.priority === 'High'
    ? 'inset 3px 0 0 #ef4444'
    : inq.priority === 'Low'
      ? 'inset 3px 0 0 rgba(107,114,128,0.6)'
      : null

  const nights = inq.check_in && inq.check_out
    ? Math.max(0, Math.round((new Date(inq.check_out).getTime() - new Date(inq.check_in).getTime()) / 86400000))
    : null
  const fmtShort = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  // Identity avatar tinting from stage color so each row's avatar reads as
  // the same family as the stage pill.
  const avatarTint = stageColor ?? '#74c895'
  const avatarStyle: React.CSSProperties = {
    background: `linear-gradient(135deg, ${avatarTint}55, ${avatarTint}15)`,
    border: `1px solid ${avatarTint}40`,
    color: '#fff',
  }

  const initials = initialsOf(inq.guest?.full_name)
  const company = inq.guest?.company ?? inq.corporate_account?.company_name ?? null
  const property = inq.property?.name ?? null
  const country = inq.guest?.country ?? null
  const vipLevel = inq.guest?.vip_level && inq.guest.vip_level !== 'Standard' ? inq.guest.vip_level : null

  const hasContact = !!(inq.guest?.email || inq.guest?.phone || inq.guest?.mobile)
  const ownerName = (inq.assigned_to as string | null) ?? null
  const sourceMeta = inq.source ? sourceBadges[inq.source] : null
  const sourceFallbackLabel = inq.source && !sourceMeta
    ? inq.source.replace(/_/g, ' ')
    : null

  /* ── Cell row ── */
  return (
    <tr
      className={[
        'group border-b border-dark-border/40 hover:bg-white/[0.025] transition-colors cursor-pointer',
        isOverdue ? 'bg-red-500/[0.025]' : '',
        isSelected ? 'bg-primary-500/[0.06]' : '',
        isExpanded ? 'bg-white/[0.02]' : '',
      ].join(' ')}
      style={priorityStripe ? { boxShadow: priorityStripe } : undefined}
      onClick={(e) => {
        const tgt = e.target as HTMLElement | null
        if (!tgt) return
        if (tgt.closest('button, a, input, select, textarea, label, [data-menu-root], [data-row-noopen]')) return
        if (window.getSelection()?.toString()) return
        onOpenInquiryDrawer()
      }}
    >
      {/* ── Bulk select cell ── */}
      <td
        className={[
          'pl-3 pr-2 py-3 text-center transition-opacity w-10',
          fieldCfg.list.bulk_select || isSelected || anySelected
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
        ].join(' ')}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-white/20 bg-white/[0.04] cursor-pointer"
          aria-label={t('inquiries.bulk.row_select', { defaultValue: 'Select row' })}
        />
      </td>

      {/* ── IDENTITY ── */}
      <td className="px-3 py-3 min-w-[280px]">
        <div className="flex items-start gap-3 relative">
          {/* Avatar */}
          <div
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[12.5px] font-bold tracking-tight shadow-inner"
            style={avatarStyle}
            aria-hidden
          >
            {initials}
          </div>

          {/* Name + chips + subtitles */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Name opens the lead's right-panel drawer (contact · activity
                  · notes · AI · tasks) — the CRM-appropriate detail. The
                  loyalty member card is reachable from Members, not here. */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenInquiryDrawer() }}
                className="font-semibold text-[14px] text-white hover:text-primary-300 transition-colors truncate text-left"
                title={t('inquiries.row.open_lead', { defaultValue: 'Open lead' })}
              >
                {inq.guest?.full_name ?? '—'}
              </button>
              <FreshnessBadge
                createdAt={inq.created_at}
                lastContactedAt={inq.last_contacted_at}
                isClosed={isClosedKind}
                t={t}
              />
              {vipLevel && (
                <span
                  className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-300 bg-amber-500/10"
                  title={t('inquiries.row.vip_tooltip', { defaultValue: 'VIP level on the guest profile' })}
                >
                  <Star size={9} className="fill-amber-300" />
                  {vipLevel}
                </span>
              )}
            </div>

            {(company || property || (fieldCfg.list.country && country) || inq.brand_id) && (
              <div className="text-[11.5px] text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
                {company && <span className="truncate">{company}</span>}
                {company && property && <span className="text-gray-600">·</span>}
                {property && <span className="text-gray-500 truncate">{property}</span>}
                {fieldCfg.list.country && country && (
                  <>
                    <span className="text-gray-600">·</span>
                    <span className="inline-flex items-center gap-0.5 text-gray-500">
                      <Globe size={10} />{country}
                    </span>
                  </>
                )}
                <BrandBadge brandId={inq.brand_id} />
              </div>
            )}

            {/* Full contact — email + phone shown in full below the name,
                each on its own line so long addresses aren't clipped and
                staff can read/copy the whole value at a glance. */}
            {(inq.guest?.email || inq.guest?.phone || inq.guest?.mobile) && (
              <div className="text-[11px] text-gray-500 mt-0.5 space-y-0.5">
                {inq.guest?.email && (
                  <div className="inline-flex items-center gap-1 break-all" title={inq.guest.email}>
                    <Mail size={10} className="opacity-60 flex-shrink-0" />
                    <span className="break-all">{inq.guest.email}</span>
                  </div>
                )}
                {(inq.guest?.phone || inq.guest?.mobile) && (
                  <div className="flex items-center gap-1" title={inq.guest?.phone || inq.guest?.mobile}>
                    <Phone size={10} className="opacity-60 flex-shrink-0" />
                    <span className="tabular-nums">{inq.guest?.phone || inq.guest?.mobile}</span>
                  </div>
                )}
              </div>
            )}

            {!hasContact && (
              <div className="text-[10.5px] italic text-gray-700 mt-0.5">
                {t('inquiries.row.no_contacts', { defaultValue: 'No contact info yet' })}
              </div>
            )}
          </div>

          {/* Hover-reveal contact actions — float right of the cell so they
              don't shift layout at rest. */}
          {hasContact && (
            <div
              className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
              data-row-noopen
              onClick={(e) => e.stopPropagation()}
            >
              <ContactActions
                email={inq.guest?.email}
                phone={inq.guest?.phone || inq.guest?.mobile}
                compact
              />
            </div>
          )}
        </div>
      </td>

      {/* ── STAY / EVENT ── */}
      {fieldCfg.list.stay && (
        <td className="px-3 py-3 text-xs whitespace-nowrap">
          {inq.check_in || inq.check_out ? (
            <>
              <div className="text-gray-200 font-medium tabular-nums">
                {inq.check_in ? fmtShort(inq.check_in) : '—'} → {inq.check_out ? fmtShort(inq.check_out) : '—'}
              </div>
              <div className="text-[10.5px] text-gray-500 mt-0.5">
                {nights !== null && `${nights}n`}{nights !== null && inq.num_rooms ? ' · ' : ''}
                {inq.num_rooms ? `${inq.num_rooms} room${inq.num_rooms === 1 ? '' : 's'}` : ''}
                {inq.room_type_requested && (nights !== null || inq.num_rooms) ? ' · ' : ''}
                {inq.room_type_requested ?? ''}
              </div>
            </>
          ) : inq.event_name ? (
            <>
              <div className="text-gray-200 font-medium truncate">{inq.event_name}</div>
              <div className="text-[10.5px] text-gray-500 mt-0.5">
                {inq.event_pax ? `${inq.event_pax} pax` : ''}
                {inq.event_pax && inq.function_space ? ' · ' : ''}
                {inq.function_space ?? ''}
              </div>
            </>
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </td>
      )}

      {/* ── VALUE (right-aligned) ── */}
      {fieldCfg.list.value && (
        <td className="px-3 py-3 text-right whitespace-nowrap">
          {inq.total_value ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-500/[0.08] border border-emerald-500/25 text-emerald-300 text-[13px] font-bold tabular-nums">
              {currencySymbol}{Number(inq.total_value).toLocaleString()}
            </span>
          ) : (
            <span className="text-gray-700 text-xs">—</span>
          )}
          {inq.paid_amount > 0 && (
            <div className="text-[10px] mt-0.5 text-emerald-400/80 tabular-nums">
              {currencySymbol}{Number(inq.paid_amount).toLocaleString()} paid
            </div>
          )}
        </td>
      )}

      {/* ── STAGE ── */}
      <td className="px-3 py-3 whitespace-nowrap" data-menu-root>
        <StageBadge
          label={stageLabel}
          stageColor={stageColor}
          fallbackClassName={statusColors[inq.status]}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            onOpenStatusMenu(rect)
          }}
          title={t('inquiries.table.click_to_change_status', { defaultValue: 'Click to change stage' })}
        />
        {inq.priority && inq.priority !== 'Normal' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenPriorityCycle() }}
            data-row-noopen
            className="block text-[9.5px] font-bold uppercase tracking-wider mt-1 opacity-70 hover:opacity-100"
            style={{
              color: inq.priority === 'High' ? '#fca5a5' : inq.priority === 'Low' ? '#9ca3af' : '#93c5fd',
            }}
            title={t('inquiries.row.cycle_priority', { defaultValue: 'Click to cycle priority' })}
          >
            {inq.priority}
          </button>
        )}
      </td>

      {/* ── AI SIGNAL ── */}
      {fieldCfg.list.ai_signal && (
        <td className="px-3 py-3 whitespace-nowrap">
          <AiSignalCell
            probability={typeof inq.ai_win_probability === 'number' ? inq.ai_win_probability : null}
            coldRisk={inq.ai_going_cold_risk}
            suggestedAction={inq.ai_suggested_action}
            brief={inq.ai_brief}
            intent={inq.ai_intent}
          />
        </td>
      )}

      {/* ── OWNER + SOURCE ── */}
      {fieldCfg.list.owner && (
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2 max-w-[180px]">
            <div
              className={[
                'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10.5px] font-bold',
                ownerName
                  ? 'bg-white/[0.06] border border-white/15 text-gray-200'
                  : 'border border-dashed border-amber-500/30 text-amber-400 bg-amber-500/[0.06]',
              ].join(' ')}
              aria-hidden
            >
              {ownerName ? initialsOf(ownerName) : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className={[
                'text-[12px] font-semibold truncate leading-tight',
                ownerName ? 'text-gray-200' : 'text-amber-400',
              ].join(' ')}>
                {ownerName ?? t('inquiries.row.unassigned', { defaultValue: 'Unassigned' })}
              </div>
              {(sourceMeta || sourceFallbackLabel) && (
                <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                  {sourceMeta?.label ?? sourceFallbackLabel}
                </div>
              )}
            </div>
          </div>
        </td>
      )}

      {/* ── NEXT ACTION ── */}
      {fieldCfg.list.next_task && (
        <td className="px-3 py-3">
          <NextActionCell inquiry={inq} onAdd={onAddTask} t={t} />
        </td>
      )}

      {/* ── Touches (legacy, off by default in v2) ── */}
      {fieldCfg.list.touches && (
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-[10px] text-gray-500 inline-flex items-center gap-2">
            {(inq.phone_calls_made ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1"><Phone size={10} />{inq.phone_calls_made}</span>
            )}
            {(inq.emails_sent ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1"><Mail size={10} />{inq.emails_sent}</span>
            )}
            {!inq.phone_calls_made && !inq.emails_sent && '—'}
          </span>
        </td>
      )}

      {/* ── Custom-field cells ── */}
      {listColumns.map(col => {
        const v = inq.custom_data?.[col.key]
        return (
          <td key={col.id} className="px-3 py-3 text-xs whitespace-nowrap text-gray-300">
            {renderCustomListValue(col.type, v)}
          </td>
        )
      })}

      {/* ── Trailing actions ── */}
      <td className="px-2 py-3 w-16" data-menu-root>
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
            title={isExpanded
              ? t('inquiries.row.collapse', { defaultValue: 'Collapse' })
              : t('inquiries.row.expand', { defaultValue: 'Expand' })}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-colors"
          >
            <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              const rect = e.currentTarget.getBoundingClientRect()
              onOpenActionMenu(rect)
            }}
            title={t('inquiries.table.more', { defaultValue: 'More' })}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-colors opacity-70 group-hover:opacity-100 transition-opacity"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}

/**
 * Custom equality — most callback props are inline lambdas that change
 * every parent render, so the default shallow compare invalidates the
 * memo every time. We skip those (the row only re-renders when its own
 * data + selection state actually change). t() is also re-created per
 * render by react-i18next, so the same skip applies.
 */
const areLeadRowPropsEqual = (a: LeadRowProps, b: LeadRowProps): boolean => {
  if (a.inquiry !== b.inquiry) return false
  if (a.isSelected !== b.isSelected) return false
  if (a.anySelected !== b.anySelected) return false
  if (a.isExpanded !== b.isExpanded) return false
  if (a.fieldCfg !== b.fieldCfg) return false
  if (a.listColumns !== b.listColumns) return false
  if (a.currencySymbol !== b.currencySymbol) return false
  if (a.sourceBadges !== b.sourceBadges) return false
  if (a.statusColors !== b.statusColors) return false
  return true
}

export default React.memo(LeadRowImpl, areLeadRowPropsEqual)
