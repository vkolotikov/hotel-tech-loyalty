/**
 * Inline-editable pipeline stage pill.
 *
 * Preferred path: render with `stageColor` from `inq.pipeline_stage?.color`
 * so each org's custom palette flows through. Falls back to the legacy
 * `STATUS_COLORS` map when no stage color is configured (typical for orgs
 * still on the v1 status text column).
 *
 * Low-luminance protection: when the configured stage color is too dark
 * (lum < 0.18) we boost the foreground to white so the label is still
 * legible — some staff configure stage colors like `#222` and the inline-
 * tinted background then renders the text invisible.
 */

import React from 'react'
import { ChevronDown } from 'lucide-react'

export interface StageBadgeProps {
  label: string                      // e.g. "Proposal Sent" or legacy "New"
  stageColor?: string | null         // hex from pipeline_stage.color, optional
  fallbackClassName?: string         // STATUS_COLORS map entry when no stageColor
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  size?: 'sm' | 'md'
  title?: string
  showCaret?: boolean                // hide caret in read-only contexts
}

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  if (h.length < 6) return 1 // unknown short hex → treat as light, no override
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  // Rec. 709 perceived-luminance approximation
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export default function StageBadge({
  label,
  stageColor,
  fallbackClassName,
  onClick,
  size = 'md',
  title,
  showCaret = true,
}: StageBadgeProps) {
  const tight = size === 'sm'
  const padding = tight ? 'px-1.5 py-[2px] text-[10px]' : 'px-2 py-0.5 text-[11px]'

  const styleProps: React.CSSProperties = {}
  let extraCls = ''

  if (stageColor) {
    const fg = luminance(stageColor) < 0.18 ? '#ffffff' : stageColor
    styleProps.background = stageColor + '20'
    styleProps.color = fg
    styleProps.border = `1px solid ${stageColor}40`
    extraCls = 'border'
  } else {
    extraCls = fallbackClassName ?? 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
  }

  const Component: any = onClick ? 'button' : 'span'

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      style={styleProps}
      className={[
        'inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap',
        padding,
        extraCls,
        onClick ? 'hover:brightness-110 transition-all' : '',
      ].join(' ')}
    >
      <span className="truncate max-w-[140px]">{label}</span>
      {showCaret && onClick && <ChevronDown size={9} className="flex-shrink-0 opacity-75" />}
    </Component>
  )
}
