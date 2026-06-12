import { useState, useRef, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api, resolveImage } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { applyThemeToDom, persistThemeSnapshot, readCachedPreset } from '../hooks/useTheme'
import { useVocabulary } from '../lib/vocabulary'
import { useIndustryHiddenSettingsTabs } from '../lib/industryGating'
import {
  Save, RefreshCw, RotateCcw, Upload, ExternalLink, Palette, Settings2,
  Bell, Brain, Cloud, Smartphone, Database, Shield, Calendar,
  Mail, Wifi, CheckCircle, XCircle, Eye, EyeOff,
  Zap, Globe, Users, Star, Layers, CreditCard, MessageSquare, Map,
  ChevronDown, ChevronRight, Link2, Phone,
  Clock, Gift, Tag, Award, Crown, Gem, ShieldCheck, Copy,
  BookOpen, Search, GitBranch, ClipboardList, Activity,
  Building2, ArrowLeft, Undo2, Briefcase, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useSubscription } from '../hooks/useSubscription'
import { BookingTab } from '../components/settings/BookingTab'
import { PipelinesAdmin } from '../components/PipelinesAdmin'
import { PlannerSettings } from '../components/PlannerSettings'
import { MenuSettings } from '../components/MenuSettings'
import { IndustrySwitcherPanel } from '../components/IndustrySwitcherPanel'
import { TeamSettings } from '../components/TeamSettings'
import { AiUsagePanel } from '../components/AiUsagePanel'
import { ApiTokensPanel } from '../components/ApiTokensPanel'
import { MessengerConnectPanel } from '../components/MessengerConnectPanel'
import { DocumentationCenter } from '../components/DocumentationCenter'

/* ─── Constants ────────────────────────────────────────────────────────── */

const TIER_COLORS: Record<string, string> = {
  Bronze: '#CD7F32', Silver: '#C0C0C0', Gold: '#FFD700',
  Platinum: '#6B6B6B', Diamond: '#00BCD4',
}

const TIER_ICON_MAP: Record<string, any> = {
  award: Award, star: Star, crown: Crown, gem: Gem, diamond: Gem,
  shield: ShieldCheck, layers: Layers,
}

const tierIconComponent = (icon?: string | null) => {
  if (!icon) return Crown
  return TIER_ICON_MAP[icon.toLowerCase()] ?? Crown
}

const COLOR_KEYS = [
  'primary_color', 'secondary_color', 'accent_color',
  'background_color', 'surface_color', 'text_color',
  'text_secondary_color', 'border_color',
  'error_color', 'warning_color', 'info_color',
]

const SECRET_KEYS = [
  'ai_openai_api_key', 'ai_anthropic_api_key',
  'booking_smoobu_api_key', 'booking_smoobu_webhook_secret',
  'mail_password', 'expo_access_token',
  'stripe_secret_key', 'stripe_webhook_secret',
  'twilio_auth_token',
  'whatsapp_access_token', 'whatsapp_verify_token',
  'google_maps_api_key', 'custom_webhook_secret',
]

interface ThemePreset {
  description: string
  colors: Record<string, string>
  // Visual personality — drives the preset card's font + layout treatment.
  // Each variant gives the preview card a distinct visual signature so a
  // grid of 14 presets reads as 14 different brands, not 14 color swatches.
  mood?: 'luxury' | 'corporate' | 'wellness' | 'boutique' | 'modern' | 'creative' | 'energetic' | 'natural' | 'minimal' | 'editorial'
  // If true the card spans 2 columns on lg+ — used for the headline presets
  // (Gold Luxury, Royal Blue, Midnight Purple) so the grid has visual rhythm
  // instead of being a uniform tile wall.
  featured?: boolean
  // Typography preview — shown as a sample headline on the card. Each
  // preset picks a font family that matches its mood so the cards FEEL
  // different even when their primary colors are similar in value.
  fontFamily?: string
}

const PRESETS: Record<string, ThemePreset> = {
  'Gold Luxury': {
    description: 'Warm gold on charcoal — premium, refined',
    mood: 'luxury',
    featured: true,
    fontFamily: 'Georgia, "Times New Roman", serif',
    colors: {
      primary_color: '#c9a84c', secondary_color: '#1e1e1e', accent_color: '#32d74b',
      background_color: '#0d0d0d', surface_color: '#161616', text_color: '#ffffff',
      text_secondary_color: '#8e8e93', border_color: '#2c2c2c',
      error_color: '#ff375f', warning_color: '#ffd60a', info_color: '#0a84ff',
    },
  },
  'Royal Blue': {
    description: 'Deep navy + crisp blue — corporate & trustworthy',
    mood: 'corporate',
    featured: true,
    fontFamily: '"Inter", "Helvetica Neue", system-ui, sans-serif',
    colors: {
      primary_color: '#3b82f6', secondary_color: '#1e293b', accent_color: '#22c55e',
      background_color: '#0f172a', surface_color: '#1e293b', text_color: '#f8fafc',
      text_secondary_color: '#94a3b8', border_color: '#334155',
      error_color: '#ef4444', warning_color: '#eab308', info_color: '#06b6d4',
    },
  },
  'Emerald': {
    description: 'Lush green & amber — wellness, eco, outdoor',
    mood: 'wellness',
    fontFamily: '"DM Serif Display", Georgia, serif',
    colors: {
      primary_color: '#10b981', secondary_color: '#1a2332', accent_color: '#f59e0b',
      background_color: '#0c1117', surface_color: '#141e29', text_color: '#f0fdf4',
      text_secondary_color: '#86efac', border_color: '#1e3a2f',
      error_color: '#f43f5e', warning_color: '#fbbf24', info_color: '#38bdf8',
    },
  },
  'Rose Boutique': {
    description: 'Warm rose & peach — boutique & lifestyle',
    mood: 'boutique',
    fontFamily: '"Playfair Display", Georgia, serif',
    colors: {
      primary_color: '#e11d48', secondary_color: '#1c1017', accent_color: '#fb923c',
      background_color: '#0f0708', surface_color: '#1c1017', text_color: '#fff1f2',
      text_secondary_color: '#fda4af', border_color: '#3b1524',
      error_color: '#dc2626', warning_color: '#facc15', info_color: '#60a5fa',
    },
  },
  'Ocean Breeze': {
    description: 'Cyan & violet — fresh, modern, calm',
    mood: 'modern',
    fontFamily: '"Manrope", "Inter", system-ui, sans-serif',
    colors: {
      primary_color: '#06b6d4', secondary_color: '#0f2937', accent_color: '#a78bfa',
      background_color: '#0a1a24', surface_color: '#0f2937', text_color: '#ecfeff',
      text_secondary_color: '#67e8f9', border_color: '#164e63',
      error_color: '#fb7185', warning_color: '#fde047', info_color: '#818cf8',
    },
  },
  'Midnight Purple': {
    description: 'Violet & pink — bold, creative, after-dark',
    mood: 'creative',
    featured: true,
    fontFamily: '"Space Grotesk", "Inter", sans-serif',
    colors: {
      primary_color: '#8b5cf6', secondary_color: '#1a1625', accent_color: '#f472b6',
      background_color: '#0e0b16', surface_color: '#1a1625', text_color: '#f5f3ff',
      text_secondary_color: '#a78bfa', border_color: '#2e1f4d',
      error_color: '#f43f5e', warning_color: '#fbbf24', info_color: '#22d3ee',
    },
  },
  'Sunset Coral': {
    description: 'Coral & amber — warm, energetic, hospitable',
    mood: 'energetic',
    fontFamily: '"Bricolage Grotesque", "Inter", sans-serif',
    colors: {
      primary_color: '#f97316', secondary_color: '#1f1410', accent_color: '#fbbf24',
      background_color: '#120906', surface_color: '#1f1410', text_color: '#fff7ed',
      text_secondary_color: '#fdba74', border_color: '#3b1f12',
      error_color: '#ef4444', warning_color: '#facc15', info_color: '#38bdf8',
    },
  },
  'Forest': {
    description: 'Pine & sage — natural, grounded, calm',
    mood: 'natural',
    fontFamily: '"Lora", Georgia, serif',
    colors: {
      primary_color: '#16a34a', secondary_color: '#0f1a14', accent_color: '#84cc16',
      background_color: '#08120c', surface_color: '#0f1a14', text_color: '#f0fdf4',
      text_secondary_color: '#86efac', border_color: '#1a2e22',
      error_color: '#dc2626', warning_color: '#eab308', info_color: '#0ea5e9',
    },
  },
  'Champagne': {
    description: 'Soft champagne & cream — refined and minimal',
    mood: 'editorial',
    fontFamily: '"Cormorant Garamond", "Times New Roman", serif',
    colors: {
      primary_color: '#d4af37', secondary_color: '#1c1814', accent_color: '#e5c494',
      background_color: '#100e0a', surface_color: '#1c1814', text_color: '#fdf6e3',
      text_secondary_color: '#c4a476', border_color: '#2e2820',
      error_color: '#e25555', warning_color: '#f5b400', info_color: '#5ec4e8',
    },
  },
  'Slate Modern': {
    description: 'Cool slate & cyan — clean, professional, neutral',
    mood: 'minimal',
    fontFamily: '"IBM Plex Sans", "Inter", sans-serif',
    colors: {
      primary_color: '#64748b', secondary_color: '#0f172a', accent_color: '#06b6d4',
      background_color: '#020617', surface_color: '#0f172a', text_color: '#f1f5f9',
      text_secondary_color: '#94a3b8', border_color: '#1e293b',
      error_color: '#f43f5e', warning_color: '#facc15', info_color: '#0ea5e9',
    },
  },
  'Tropical Mint': {
    description: 'Mint & teal — light, fresh, summer',
    mood: 'energetic',
    fontFamily: '"Quicksand", "Manrope", sans-serif',
    colors: {
      primary_color: '#14b8a6', secondary_color: '#0a1f1d', accent_color: '#fde047',
      background_color: '#04110f', surface_color: '#0a1f1d', text_color: '#f0fdfa',
      text_secondary_color: '#5eead4', border_color: '#13332e',
      error_color: '#fb7185', warning_color: '#facc15', info_color: '#38bdf8',
    },
  },
  'Burgundy': {
    description: 'Rich burgundy & gold — premium, mature, classic',
    mood: 'luxury',
    fontFamily: '"EB Garamond", "Times New Roman", serif',
    colors: {
      primary_color: '#9f1239', secondary_color: '#1a0a0f', accent_color: '#d4af37',
      background_color: '#0e0608', surface_color: '#1a0a0f', text_color: '#fff1f2',
      text_secondary_color: '#e8aab6', border_color: '#3b1220',
      error_color: '#dc2626', warning_color: '#eab308', info_color: '#60a5fa',
    },
  },
  'Sky Minimal': {
    description: 'Sky blue & soft gray — light, airy, modern',
    mood: 'minimal',
    fontFamily: '"Outfit", "Inter", sans-serif',
    colors: {
      primary_color: '#0ea5e9', secondary_color: '#0f1a23', accent_color: '#a78bfa',
      background_color: '#050b12', surface_color: '#0f1a23', text_color: '#f0f9ff',
      text_secondary_color: '#7dd3fc', border_color: '#1e3a52',
      error_color: '#f43f5e', warning_color: '#fbbf24', info_color: '#22d3ee',
    },
  },
  'Obsidian': {
    description: 'Pure black & electric blue — bold and dramatic',
    mood: 'creative',
    fontFamily: '"JetBrains Mono", "Courier New", monospace',
    colors: {
      primary_color: '#3b82f6', secondary_color: '#0a0a0a', accent_color: '#22d3ee',
      background_color: '#000000', surface_color: '#0a0a0a', text_color: '#fafafa',
      text_secondary_color: '#737373', border_color: '#1a1a1a',
      error_color: '#ef4444', warning_color: '#eab308', info_color: '#06b6d4',
    },
  },
}

const DEFAULT_PRESET = 'Gold Luxury'

/**
 * PresetCard — a single theme-preset preview card.
 *
 * Pre-redesign these cards were uniform: tiny color strip + name + 5
 * color dots. They all looked the same and didn't reveal what the theme
 * would actually feel like in use. Customer feedback (2026-06-13):
 * 'make also styles more modern and different one to another, maybe also
 * add some layout or size styling or smth'.
 *
 * Each card now renders:
 *  - A bold gradient header band using the preset's primary + accent + secondary
 *  - A real mini-UI mockup inside the preview area: a sample 'Reservations'
 *    badge in primary, an 'Active' pill in accent, a sample text line.
 *  - The preset name rendered in the preset's own font-family — luxury
 *    gets a serif, modern gets a clean sans, creative gets Space Grotesk,
 *    Obsidian gets monospace. This is what makes the cards feel like 14
 *    different brands instead of 14 swatches.
 *  - 5 color dots stay as a quick legend.
 *  - Featured cards (Gold Luxury / Royal Blue / Midnight Purple) span
 *    2 columns on lg+ for visual rhythm.
 *  - Active preset gets a glowing primary-coloured ring + corner check.
 */
function PresetCard({
  name,
  preset,
  isActive,
  onClick,
}: {
  name: string
  preset: ThemePreset
  isActive: boolean
  onClick: () => void
}) {
  const c = preset.colors
  const isFeatured = !!preset.featured
  const mood = preset.mood ?? 'modern'

  // Per-mood card shape. Luxury/editorial get near-square corners (refined),
  // energetic/natural get heavily rounded (playful), minimal stays close to
  // a hairline. This is what makes the GRID feel like a curated mix of
  // design systems instead of 14 same-shape tiles in different colors.
  const radiusClass: Record<string, string> = {
    luxury: 'rounded-md',
    corporate: 'rounded-lg',
    wellness: 'rounded-2xl',
    boutique: 'rounded-3xl',
    modern: 'rounded-xl',
    creative: 'rounded-sm',
    energetic: 'rounded-[28px]',
    natural: 'rounded-[28px]',
    minimal: 'rounded-md',
    editorial: 'rounded-none',
  }

  return (
    <button
      onClick={onClick}
      className={`relative text-left overflow-hidden border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl group ${
        radiusClass[mood] ?? 'rounded-xl'
      } ${isFeatured ? 'lg:col-span-2' : ''} ${
        isActive ? 'border-transparent' : 'border-white/[0.06] hover:border-white/20'
      }`}
      style={{
        background: c.surface_color,
        boxShadow: isActive
          ? `0 0 0 2px ${c.primary_color}, 0 12px 32px -8px ${c.primary_color}66`
          : undefined,
      }}
    >
      {/* HEADER BAND — each mood gets its own treatment so even the top
          16-24px of the card signals what design language it's in. */}
      <MoodHeader mood={mood} colors={c} isFeatured={isFeatured} isActive={isActive} />

      {/* BODY — split into a NAME row (consistent across cards so the grid
          stays scannable) and a MOOD-SPECIFIC PREVIEW (mini app mockup
          rendered in that mood's design vocabulary). */}
      <div
        className={`${isFeatured ? 'p-5' : 'p-4'} flex flex-col gap-3`}
        style={{ background: c.background_color }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div
              className={`${isFeatured ? 'text-xl' : 'text-base'} font-bold leading-tight tracking-tight truncate`}
              style={{ color: c.text_color, fontFamily: preset.fontFamily }}
            >
              {name}
            </div>
            <p
              className={`${isFeatured ? 'text-xs' : 'text-[10px]'} leading-snug mt-1 line-clamp-2`}
              style={{ color: c.text_secondary_color }}
            >
              {preset.description}
            </p>
          </div>
        </div>

        {/* Mood-specific mini mockup — actual mini-UI rendered in this
            mood's voice. NOT just a button + pill across the board. */}
        <MoodPreview mood={mood} colors={c} fontFamily={preset.fontFamily} isFeatured={isFeatured} />

        {/* Color dot legend + mood label — same across all cards. */}
        <div className="flex items-center gap-1.5 mt-auto pt-1">
          {[c.primary_color, c.accent_color, c.info_color, c.warning_color, c.error_color].map((col, i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full border"
              style={{ backgroundColor: col, borderColor: c.border_color }}
            />
          ))}
          <span
            className="ml-auto text-[9px] uppercase tracking-widest"
            style={{ color: c.text_secondary_color }}
          >
            {mood}
          </span>
        </div>
      </div>
    </button>
  )
}

/* ─── Per-mood header treatments ──────────────────────────────────────── */
function MoodHeader({
  mood,
  colors: c,
  isFeatured,
  isActive,
}: {
  mood: string
  colors: Record<string, string>
  isFeatured: boolean
  isActive: boolean
}) {
  const h = isFeatured ? 'h-24' : 'h-16'
  const corner = isActive && (
    <div
      className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center z-10"
      style={{ background: c.surface_color, color: c.primary_color }}
    >
      <CheckCircle size={14} />
    </div>
  )

  switch (mood) {
    case 'luxury':
      // Solid primary + thin gold hairline at the bottom — refined, no orbs.
      return (
        <div className={`relative w-full ${h}`} style={{ background: c.primary_color }}>
          {corner}
          <div
            className="absolute bottom-0 left-0 right-0 h-px"
            style={{ background: c.accent_color, boxShadow: `0 -1px 0 ${c.text_color}22` }}
          />
        </div>
      )
    case 'corporate':
      // Three vertical bars — primary / accent / info — read like a brand strip.
      return (
        <div className={`relative w-full ${h} flex`}>
          {corner}
          <div className="flex-[2]" style={{ background: c.primary_color }} />
          <div className="flex-1" style={{ background: c.accent_color }} />
          <div className="flex-1" style={{ background: c.info_color }} />
        </div>
      )
    case 'creative':
      // Diagonal gradient slash — moody, off-axis.
      return (
        <div
          className={`relative w-full ${h}`}
          style={{
            background: `linear-gradient(115deg, ${c.primary_color} 0%, ${c.primary_color} 55%, ${c.accent_color} 55%, ${c.accent_color} 100%)`,
          }}
        >
          {corner}
        </div>
      )
    case 'energetic':
      // Radial sunburst from one corner — bursting, warm.
      return (
        <div
          className={`relative w-full ${h}`}
          style={{
            background: `radial-gradient(circle at 80% 20%, ${c.warning_color} 0%, ${c.primary_color} 35%, ${c.primary_color} 100%)`,
          }}
        >
          {corner}
        </div>
      )
    case 'natural':
      // Soft top-down wash that fades, no hard edge.
      return (
        <div
          className={`relative w-full ${h}`}
          style={{
            background: `linear-gradient(180deg, ${c.primary_color} 0%, ${c.primary_color}cc 60%, ${c.surface_color} 100%)`,
          }}
        >
          {corner}
        </div>
      )
    case 'minimal':
      // Mostly surface — just a 2px primary stripe at the bottom.
      return (
        <div className={`relative w-full ${h}`} style={{ background: c.surface_color }}>
          {corner}
          <div className="absolute bottom-0 left-0 h-[2px]" style={{ background: c.primary_color, width: '40%' }} />
        </div>
      )
    case 'editorial':
      // Solid + decorative caret strip — magazine masthead vibe.
      return (
        <div className={`relative w-full ${h}`} style={{ background: c.primary_color }}>
          {corner}
          <div
            className="absolute bottom-2 right-3 px-1.5 py-0.5 text-[8px] font-semibold tracking-widest uppercase"
            style={{ background: c.accent_color, color: c.background_color }}
          >
            Issue 01
          </div>
        </div>
      )
    case 'wellness':
      // Soft sage wash with a faint sun in the corner.
      return (
        <div className={`relative w-full ${h}`} style={{ background: `linear-gradient(160deg, ${c.primary_color} 0%, ${c.accent_color}cc 100%)` }}>
          {corner}
          <div
            className="absolute top-3 right-4 rounded-full opacity-50"
            style={{ width: 28, height: 28, background: c.warning_color, filter: 'blur(6px)' }}
          />
        </div>
      )
    case 'boutique':
      // Soft gradient with offset rose circle — boutique-window feel.
      return (
        <div className={`relative w-full ${h}`} style={{ background: `linear-gradient(135deg, ${c.primary_color} 0%, ${c.accent_color} 100%)` }}>
          {corner}
          <div
            className="absolute -bottom-3 right-4 rounded-full"
            style={{ width: 36, height: 36, background: c.accent_color, opacity: 0.5, filter: 'blur(8px)' }}
          />
        </div>
      )
    default:
      // 'modern' (and fallback) — current gradient + orbs treatment.
      return (
        <div
          className={`relative w-full ${h}`}
          style={{ background: `linear-gradient(135deg, ${c.primary_color} 0%, ${c.primary_color} 40%, ${c.accent_color} 100%)` }}
        >
          {corner}
          <div
            className="absolute top-2 right-3 rounded-full opacity-30"
            style={{ width: isFeatured ? 56 : 32, height: isFeatured ? 56 : 32, background: c.info_color, filter: 'blur(8px)' }}
          />
          <div
            className="absolute bottom-1 left-4 rounded-full opacity-40"
            style={{ width: isFeatured ? 24 : 16, height: isFeatured ? 24 : 16, background: c.warning_color, filter: 'blur(4px)' }}
          />
        </div>
      )
  }
}

/* ─── Per-mood mini UI mockups ──────────────────────────────────────────
   Each preset renders a DIFFERENT mockup snippet inside its card — an
   invoice line for luxury, a KPI tile for corporate, a code-style tag
   for creative, etc. This is what makes 14 presets read as 14 different
   design systems instead of 14 color-swatch variations of one template. */
function MoodPreview({
  mood,
  colors: c,
  fontFamily,
  isFeatured,
}: {
  mood: string
  colors: Record<string, string>
  fontFamily?: string
  isFeatured: boolean
}) {
  const baseSize = isFeatured ? 'text-xs' : 'text-[10px]'

  switch (mood) {
    case 'luxury':
      // Invoice-line: big serif amount + small "Suite Revenue" caption.
      return (
        <div
          className="px-3 py-2.5 border-t border-b"
          style={{ borderColor: `${c.accent_color}55`, background: `${c.primary_color}08` }}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-[0.2em]" style={{ color: c.text_secondary_color }}>
              Suite Revenue
            </span>
            <span className="text-[9px] tabular-nums" style={{ color: c.accent_color }}>
              +12%
            </span>
          </div>
          <div
            className={`${isFeatured ? 'text-2xl' : 'text-lg'} font-bold tabular-nums mt-0.5`}
            style={{ color: c.text_color, fontFamily }}
          >
            €2,450
          </div>
        </div>
      )

    case 'corporate':
      // 2x2 KPI grid — exactly what a dashboard looks like.
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'Revenue', value: '$142K', tone: c.primary_color },
            { label: 'Bookings', value: '87',   tone: c.accent_color },
            { label: 'Occupancy', value: '76%', tone: c.info_color },
            { label: 'Rate', value: '$480',     tone: c.warning_color },
          ].map((k, i) => (
            <div
              key={i}
              className="px-2 py-1 rounded border"
              style={{ borderColor: c.border_color, background: c.surface_color }}
            >
              <div className="text-[8px] uppercase tracking-wider" style={{ color: c.text_secondary_color }}>
                {k.label}
              </div>
              <div className={`${baseSize} font-bold tabular-nums`} style={{ color: k.tone }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>
      )

    case 'boutique':
      // Soft welcome card with italic name + VIP gold pill.
      return (
        <div
          className="px-3 py-2.5 rounded-2xl"
          style={{ background: `${c.primary_color}10`, border: `1px solid ${c.primary_color}33` }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[8px] uppercase tracking-[0.18em]" style={{ color: c.text_secondary_color }}>
                Welcome back
              </div>
              <div
                className={`${isFeatured ? 'text-base' : 'text-sm'} italic font-semibold truncate`}
                style={{ color: c.text_color, fontFamily }}
              >
                Sarah Mitchell
              </div>
            </div>
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
              style={{ background: c.accent_color, color: c.background_color, fontFamily }}
            >
              VIP
            </span>
          </div>
        </div>
      )

    case 'creative':
      // Code-style tag with bracket characters — devtool / studio vibe.
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`${baseSize} font-mono px-2 py-1 rounded-sm`}
            style={{
              background: c.background_color,
              color: c.accent_color,
              border: `1px solid ${c.accent_color}55`,
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            }}
          >
            &lt;Component /&gt;
          </span>
          <span
            className={`${baseSize} font-bold uppercase tracking-widest`}
            style={{
              background: c.primary_color,
              color: c.background_color,
              padding: '4px 10px',
              clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
            }}
          >
            BETA
          </span>
        </div>
      )

    case 'energetic':
      // Progress bar + 'Save 30%' bouncy pill.
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className={baseSize} style={{ color: c.text_secondary_color }}>
              Booked tonight
            </span>
            <span className={`${baseSize} font-bold`} style={{ color: c.primary_color }}>
              67%
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: `${c.primary_color}22` }}>
            <div
              className="h-full rounded-full"
              style={{ width: '67%', background: `linear-gradient(90deg, ${c.primary_color}, ${c.warning_color})` }}
            />
          </div>
          <span
            className={`${baseSize} font-bold inline-block px-2.5 py-0.5 rounded-full mt-1`}
            style={{ background: c.accent_color, color: c.background_color }}
          >
            Save 30%
          </span>
        </div>
      )

    case 'natural':
      // Round soft bubble badges + a serif tagline — earthy.
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {['Eco', 'Outdoor', 'Local'].map((tag, i) => (
              <span
                key={tag}
                className="text-[9px] font-semibold px-2.5 py-1 rounded-full"
                style={{
                  background: i === 0 ? c.primary_color : c.surface_color,
                  color: i === 0 ? c.background_color : c.text_color,
                  border: i === 0 ? 'none' : `1px solid ${c.border_color}`,
                  fontFamily,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
          <div className={`${baseSize} italic`} style={{ color: c.text_secondary_color, fontFamily }}>
            Rooted in nature, refined by season.
          </div>
        </div>
      )

    case 'wellness':
      // Mini stat with leaf-style accent.
      return (
        <div className="flex items-center gap-3">
          <div
            className="rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              width: isFeatured ? 56 : 40,
              height: isFeatured ? 56 : 40,
              background: `${c.primary_color}22`,
              border: `1px solid ${c.primary_color}44`,
            }}
          >
            <span className={`${isFeatured ? 'text-2xl' : 'text-lg'}`} style={{ color: c.primary_color }}>
              ✿
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-[8px] uppercase tracking-widest" style={{ color: c.text_secondary_color }}>
              Sessions
            </div>
            <div className={`${isFeatured ? 'text-xl' : 'text-base'} font-bold tabular-nums`} style={{ color: c.primary_color, fontFamily }}>
              48 this week
            </div>
          </div>
        </div>
      )

    case 'minimal':
      // Big A→B typography sample, no chrome.
      return (
        <div className="flex items-baseline gap-3">
          <span
            className={`${isFeatured ? 'text-4xl' : 'text-3xl'} font-light`}
            style={{ color: c.text_color, fontFamily }}
          >
            Aa
          </span>
          <div className="space-y-0.5">
            <div className="text-[8px] uppercase tracking-[0.25em]" style={{ color: c.text_secondary_color }}>
              Primary
            </div>
            <div className={`${baseSize} font-mono`} style={{ color: c.primary_color }}>
              {c.primary_color}
            </div>
          </div>
        </div>
      )

    case 'editorial':
      // Small-caps headline + 2 lines of justified paragraph — magazine column.
      return (
        <div className="border-l-2 pl-3" style={{ borderColor: c.accent_color }}>
          <div
            className="text-[9px] uppercase tracking-[0.3em] font-bold mb-0.5"
            style={{ color: c.accent_color }}
          >
            Volume V
          </div>
          <div
            className={`${isFeatured ? 'text-base' : 'text-sm'} font-bold leading-tight`}
            style={{ color: c.text_color, fontFamily }}
          >
            The Art of Hosting
          </div>
          <p
            className={`${baseSize} leading-snug mt-1 text-justify`}
            style={{ color: c.text_secondary_color, fontFamily, hyphens: 'auto' }}
          >
            A curated selection of refined stays — from coastal retreats to alpine sanctuaries.
          </p>
        </div>
      )

    case 'modern':
    default:
      // Default: refined version of the old button + pill combo with
      // a sample "row" so it reads as a list item from an admin page.
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`${baseSize} font-semibold px-2 py-0.5 rounded-md`}
              style={{ background: c.primary_color, color: c.background_color, fontFamily }}
            >
              Reservations
            </span>
            <span
              className={`${baseSize} font-semibold px-2 py-0.5 rounded-full`}
              style={{ background: `${c.accent_color}22`, color: c.accent_color, border: `1px solid ${c.accent_color}44` }}
            >
              Active
            </span>
            {isFeatured && (
              <span
                className={`${baseSize} px-2 py-0.5 rounded-full`}
                style={{ background: `${c.info_color}18`, color: c.info_color, border: `1px solid ${c.info_color}33` }}
              >
                Trial
              </span>
            )}
          </div>
          <div
            className="px-2 py-1.5 rounded-md flex items-center justify-between"
            style={{ background: c.surface_color, border: `1px solid ${c.border_color}` }}
          >
            <span className={`${baseSize} font-medium`} style={{ color: c.text_color }}>
              Suite 304
            </span>
            <span className={`${baseSize} tabular-nums`} style={{ color: c.text_secondary_color }}>
              3 nights
            </span>
          </div>
        </div>
      )
  }
}

/* ─── Tab Config ────────────────────────────────────────────────────────── */

interface Tab {
  id: string
  label: string
  icon: any
  desc: string
  groups?: string[]
  custom?: boolean
  superAdminOnly?: boolean
  feature?: string   // required SaaS feature
  product?: string   // required SaaS product
}

const TABS: Tab[] = [
  { id: 'general',       label: 'Hotel Info',         icon: Building2,     desc: 'Hotel name, contact info, account',         groups: ['general'],      custom: true },
  // Phase 10 — in-app industry switcher (parallel to Phase 4's cross-
  // domain banner). The tab id MUST stay 'industry' — the Phase 4
  // IndustryMismatchBanner suppresses itself on /settings?tab=industry
  // to avoid two competing CTAs for the same action.
  { id: 'industry',      label: 'Industry',           icon: Briefcase,     desc: 'Switch the workspace industry (hotel / beauty / medical / restaurant / …)', custom: true },
  { id: 'branding',      label: 'Branding & Theme',   icon: Palette,       desc: 'Colors, logo, theme presets',               groups: ['appearance'],   custom: true },
  { id: 'loyalty',       label: 'Loyalty Program',    icon: Star,          desc: 'Points, tiers, rewards rules',              groups: ['points'],       custom: true, product: 'loyalty' },
  { id: 'notifications', label: 'Notifications',      icon: Bell,          desc: 'Push and email notification config',        groups: ['notifications'], feature: 'push_notifications' },
  { id: 'integrations',  label: 'Integrations & API', icon: Zap,           desc: 'PMS, payments, messaging, developer tokens', groups: ['integrations'], custom: true },
  { id: 'booking',       label: 'Booking Engine',     icon: Calendar,      desc: 'Rates, currency, payment, Smoobu sync',     groups: ['booking'],      custom: true, product: 'booking' },
  { id: 'pipelines',     label: 'Pipelines & Fields', icon: GitBranch,     desc: 'CRM pipelines, stages, fields, industry presets', custom: true },
  { id: 'planner',       label: 'Planner',            icon: ClipboardList, desc: 'Task groups, templates, industry presets',  custom: true },
  { id: 'menu',          label: 'Sidebar Menu',       icon: Layers,        desc: 'Show or hide sidebar groups for your org',  custom: true },
  { id: 'team',          label: 'Team & Roles',       icon: Users,         desc: 'Invite teammates, manage roles + permissions', custom: true },
  { id: 'mobile_app',    label: 'Member App',         icon: Smartphone,    desc: 'Loyalty mobile app appearance + preview',   groups: ['mobile_app'], custom: true, product: 'loyalty' },
  { id: 'documentation', label: 'Help & Docs',        icon: BookOpen,      desc: 'Platform guides, use cases, FAQ',           custom: true },
  { id: 'ai_usage',      label: 'AI Usage',           icon: Activity,      desc: 'Spend MTD, per-model + per-feature breakdown, plan cap', custom: true },
  { id: 'ai_system',     label: 'System',             icon: Shield,        desc: 'AI models, system info, diagnostics',       custom: true, superAdminOnly: true },
]

/**
 * Per-tab accent colour for the flat home grid (2026-05-30). Replaces
 * the previous SECTIONS structure that grouped tabs under labelled
 * headers — every tab now renders as a peer in the square-tile grid,
 * each carrying its own identity colour.
 *
 * If we ever need sections back (home grid getting crowded above 20
 * tabs), the original groupings were:
 *   workspace    → general · branding · menu
 *   crm          → pipelines · planner
 *   loyalty      → loyalty · mobile_app
 *   operations   → booking · notifications
 *   team         → team
 *   integrations → integrations
 *   ai           → ai_usage · ai_system
 *   help         → documentation
 */
const TAB_ACCENTS: Record<string, string> = {
  general:       '#60a5fa', // blue
  industry:      '#f59e0b', // amber — primary brand colour (matches the Phase 4 mismatch banner)
  branding:      '#f472b6', // pink
  menu:          '#22d3ee', // cyan
  pipelines:     '#c9a84c', // gold
  planner:       '#fb923c', // orange
  loyalty:       '#fbbf24', // amber
  mobile_app:    '#a78bfa', // violet
  booking:       '#34d399', // emerald
  notifications: '#38bdf8', // sky
  team:          '#22d3ee', // cyan
  integrations:  '#a78bfa', // violet
  ai_usage:      '#c084fc', // purple
  ai_system:     '#f87171', // red — danger-adjacent
  documentation: '#9ca3af', // gray
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export function Settings() {
  const { user, staff } = useAuthStore()
  const isSuperAdmin = staff?.role === 'super_admin'
  const { hasFeature, hasProduct } = useSubscription()
  const qc = useQueryClient()
  const { t } = useTranslation()
  // Phase 3 — wraps tab + tile labels so "Hotel Info" reads "Business
  // Info" on beauty, "Practice Info" on medical, "Venue Info" on
  // restaurant. Tab `id` stays canonical — `?tab=general` deep-links
  // keep working on every industry.
  const vocab = useVocabulary()
  // Phase 4 — per-industry Settings tab gating. Medical hides
  // 'loyalty' + 'mobile_app' + 'booking'. Beauty + restaurant hide
  // 'booking' (Phase 7 ships the Appointment Engine settings parity).
  // Hotel gets an empty list. Keyed on tab `id` (not label) so the
  // Phase 3 vocabulary relabel can't accidentally drift this list out
  // of sync.
  const industryHiddenTabs = useIndustryHiddenSettingsTabs()
  // Active tab persists to the URL via ?tab= so refreshes + deep links
  // land on the same place. 'home' = the grid index (default).
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'home'
  const setActiveTab = (id: string) => {
    if (id === 'home') {
      const next = new URLSearchParams(searchParams)
      next.delete('tab')
      setSearchParams(next, { replace: true })
    } else {
      setSearchParams({ tab: id }, { replace: true })
    }
  }
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({})
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set())
  const [testingIntegration, setTestingIntegration] = useState<string | null>(null)
  // Test results include an optional structured `warning` that the
  // backend surfaces for actionable advisories — e.g. Stripe
  // restricted-key missing the refunds:write scope (preventive follow-
  // up to the Forrest Glamp stuck-refund situation). When present, we
  // render a yellow banner inside the integration card so the operator
  // can fix it at config time instead of finding out only when a real
  // refund first fails.
  const [testResults, setTestResults] = useState<Record<string, {
    success: boolean
    message: string
    warning?: { code: string; title: string; message: string }
  }>>({})
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [syncingNow, setSyncingNow] = useState<string | null>(null)
  const [showSyncHistory, setShowSyncHistory] = useState<Set<string>>(new Set())
  const [smoobuChannels, setSmoobuChannels] = useState<{ channels: any[]; suggested: number | null; configured: string | null } | null>(null)
  const [loadingSmoobuChannels, setLoadingSmoobuChannels] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [homeSearch, setHomeSearch] = useState('')

  /* ── Queries ─────────────────────────────────────────────────────────── */

  const { data: tiersData, isLoading: tiersLoading } = useQuery({
    queryKey: ['admin-tiers'],
    queryFn: () => api.get('/v1/admin/tiers').then(r => r.data),
  })

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/v1/admin/settings').then(r => r.data),
  })

  // Per-integration sync status — last sync timestamp + recent history.
  // Keyed by integration id (currently only smoobu writes audit entries).
  const { data: syncStatus, refetch: refetchSync } = useQuery<any>({
    queryKey: ['integration-sync-status'],
    queryFn: () => api.get('/v1/admin/settings/sync-status').then(r => r.data),
    staleTime: 30_000,
  })

  /* ── Mutations ───────────────────────────────────────────────────────── */

  const saveMutation = useMutation({
    // Pass the original payload through to onSuccess so we can verify it.
    mutationFn: async (settings: { key: string; value: any }[]) => {
      const res = await api.put('/v1/admin/settings', { settings })
      return { res, sent: settings }
    },
    onSuccess: ({ res, sent }) => {
      // Verify the server actually persisted what we sent. The endpoint now
      // echoes back the stored values in `data.persisted`. If anything is
      // missing (e.g. permissions/scope check silently skipped a key), the
      // user gets a real warning instead of a misleading "Settings saved"
      // toast followed by a confused reload that shows the old theme.
      const persisted = (res.data as any)?.persisted ?? {}
      const missing: string[] = []
      for (const { key, value } of sent) {
        const stored = persisted[key]
        // Coerce to strings since the API casts everything to string on store.
        if (stored == null || String(stored) !== String(value)) {
          missing.push(key)
        }
      }
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      qc.invalidateQueries({ queryKey: ['admin-theme'] })
      setEditedSettings({})
      if (missing.length > 0) {
        toast.error(`Saved partial — ${missing.length} setting${missing.length === 1 ? '' : 's'} didn't persist (${missing.slice(0, 3).join(', ')}). Try again or contact support.`)
      } else {
        toast.success('Settings saved')
      }
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const logoMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('logo', file)
      return api.post('/v1/admin/settings/logo', fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      qc.invalidateQueries({ queryKey: ['settings-logo'] })
      setLogoPreview(null)
      toast.success('Logo uploaded')
    },
    onError: () => toast.error('Logo upload failed'),
  })

  /* ── Documentation moved to <DocumentationCenter /> — see below ─────── */

  /* ── Handlers ────────────────────────────────────────────────────────── */

  const allSettings = settingsData?.settings ?? {}

  const getVal = (key: string): string => {
    if (editedSettings[key] !== undefined) return editedSettings[key]
    for (const group of Object.values(allSettings)) {
      const found = (group as any[]).find((s: any) => s.key === key)
      if (found) return String(found.value ?? '')
    }
    return ''
  }

  const handleChange = (key: string, value: string) => {
    setEditedSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    const settings = Object.entries(editedSettings).map(([key, value]) => ({ key, value }))
    if (settings.length > 0) saveMutation.mutate(settings)
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setLogoPreview(reader.result as string)
      reader.readAsDataURL(file)
      logoMutation.mutate(file)
    }
  }

  /**
   * Snapshot of the colour values right BEFORE the most recent preset
   * apply -- so the user can undo within a 15-second window if they
   * picked the wrong one. Mirrors the snapshot pattern we use on
   * destructive bulk mutations elsewhere in the app.
   */
  const [undoSnapshot, setUndoSnapshot] = useState<{
    colors: Record<string, string>
    fromPresetName: string | null
    toPresetName: string
    expiresAt: number
  } | null>(null)

  /**
   * Apply a preset. Order matters:
   *   1. Snapshot the current colors so undo can revert.
   *   2. Push the new palette to the DOM via applyThemeToDom() so the
   *      page re-themes INSTANTLY -- no waiting for the network
   *      round-trip + admin-theme query refetch. Previously the click
   *      felt broken because the visual flip lagged the save toast.
   *   3. Persist to the backend in the background.
   *   4. After save, refetch admin-theme so the server-truth matches
   *      what we already painted (and any other tab on the same
   *      session picks it up).
   */
  const applyPreset = (name: string) => {
    const p = PRESETS[name]
    if (!p) return

    // Snapshot current colors before flipping
    const previousColors: Record<string, string> = {}
    for (const k of COLOR_KEYS) previousColors[k] = getVal(k) || ''
    const previousPreset = detectActivePreset()
    setUndoSnapshot({
      colors: previousColors,
      fromPresetName: previousPreset,
      toPresetName: name,
      expiresAt: Date.now() + 15_000,
    })

    // Instant visual apply -- the user sees the theme flip the moment
    // they click, instead of after ~500ms of network latency.
    applyThemeToDom(p.colors as any)

    // Persist to localStorage immediately so a refresh during the in-
    // flight save still paints the new theme. Without this, a user who
    // clicks a preset and reloads the tab before the PUT resolves loses
    // the change visually until the server catches up (or forever, if
    // the save errored).
    persistThemeSnapshot(p.colors, name)

    setEditedSettings(prev => ({ ...prev, ...p.colors }))
    // Tag the saved settings with the preset name so the server-side
    // theme stays self-describing — useful for cross-device consistency
    // (any other admin browser fetching /v1/theme can see which preset
    // is "officially" active without per-color reverse engineering).
    const settings = [
      ...Object.entries(p.colors).map(([key, value]) => ({ key, value })),
      { key: 'theme_preset_name', value: name },
    ]
    saveMutation.mutate(settings)
  }

  /**
   * Revert to the colour palette that was active before the most
   * recent applyPreset() call. Same instant-apply + persist flow.
   */
  const undoPreset = () => {
    if (!undoSnapshot) return
    const { colors, fromPresetName } = undoSnapshot
    // Restore previous colors via DOM and queued save
    applyThemeToDom(colors as any)
    // Mirror the localStorage snapshot so refresh during the undo's
    // in-flight save still paints the reverted theme.
    persistThemeSnapshot(colors, fromPresetName)
    setEditedSettings(prev => ({ ...prev, ...colors }))
    const settings = [
      ...Object.entries(colors).map(([key, value]) => ({ key, value })),
      { key: 'theme_preset_name', value: fromPresetName ?? '' },
    ]
    saveMutation.mutate(settings)
    setUndoSnapshot(null)
    toast.success(fromPresetName ? `Reverted to "${fromPresetName}"` : 'Theme reverted')
  }

  /**
   * Auto-clear the undo snapshot when the 15-second window expires
   * so the "Undo" affordance disappears once it's no longer relevant.
   */
  useEffect(() => {
    if (!undoSnapshot) return
    const ms = Math.max(0, undoSnapshot.expiresAt - Date.now())
    const t = setTimeout(() => setUndoSnapshot(null), ms)
    return () => clearTimeout(t)
  }, [undoSnapshot?.expiresAt])

  /**
   * Detect which preset (if any) matches the current colors.
   *
   * Resolution order:
   *   1. Server-stored `theme_preset_name` setting (added in 2026-06)
   *      -- authoritative across devices.
   *   2. Exact color match -- catches legacy orgs that picked a preset
   *      before the name was being persisted.
   *   3. localStorage cached name -- bridge between an in-flight save
   *      and the server fetch landing, so the "X active" chip never
   *      blanks out mid-save.
   */
  const detectActivePreset = (): string | null => {
    // 1. Server-stored name wins
    const storedName = getVal('theme_preset_name')
    if (storedName && PRESETS[storedName]) return storedName

    // 2. Fall back to exact color match
    const current: Record<string, string> = {}
    for (const k of COLOR_KEYS) current[k] = (getVal(k) || '').toLowerCase()
    for (const [name, p] of Object.entries(PRESETS)) {
      if (COLOR_KEYS.every(k => current[k] === p.colors[k]?.toLowerCase())) return name
    }

    // 3. localStorage bridge — only honour if the cached name is still
    // in the PRESETS catalogue (presets removed in a future release
    // shouldn't show ghost "active" chips)
    const cached = readCachedPreset()
    if (cached && PRESETS[cached]) return cached

    return null
  }

  const toggleReveal = (key: string) => {
    setRevealedSecrets(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const testConnection = async (type: string) => {
    setTestingIntegration(type)
    try {
      const { data } = await api.post('/v1/admin/settings/test-integration', { type })
      setTestResults(prev => ({ ...prev, [type]: data }))
      if (data.success) {
        // Even on success the backend may attach a `warning` object
        // (e.g. Stripe restricted key with no refunds:write). Surface
        // it as a non-blocking toast so the operator notices on the
        // spot; the persistent banner in the card body carries the
        // full fix instructions.
        if (data.warning) {
          toast(`${type}: connected — ${data.warning.title}`, { icon: '⚠️' })
        } else {
          toast.success(`${type}: ${data.message}`)
        }
      } else {
        toast.error(`${type}: ${data.message}`)
      }
    } catch {
      setTestResults(prev => ({ ...prev, [type]: { success: false, message: 'Request failed' } }))
      toast.error(`${type}: connection test failed`)
    }
    setTestingIntegration(null)
  }

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const hasChanges = Object.keys(editedSettings).length > 0

  // Get settings for a group (handle both array and object responses)
  const groupSettings = (groupName: string): any[] => {
    const raw = allSettings[groupName]
    if (!raw) return []
    return Array.isArray(raw) ? raw : Object.values(raw)
  }

  // Get settings for the current tab
  const tabSettings = useMemo(() => {
    const tab = TABS.find(t => t.id === activeTab)
    if (!tab?.groups) return []
    return tab.groups.flatMap(g => groupSettings(g))
  }, [activeTab, allSettings])

  const currentLogoUrl = resolveImage(getVal('company_logo') || null)

  /* ── Shared UI ───────────────────────────────────────────────────────── */

  const cardClass = 'rounded-2xl border border-white/[0.06] p-6'
  const cardStyle = { background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))', boxShadow: '0 16px 30px rgba(0,0,0,0.18)' }
  const inputClass = 'w-full bg-[#0f1c18] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/40'
  const btnPrimary = 'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all'

  /* ── Setting Field Renderer ──────────────────────────────────────────── */

  const renderField = (setting: any) => {
    const isColor = COLOR_KEYS.includes(setting.key)
    const isSecret = SECRET_KEYS.includes(setting.key)
    const currentVal = editedSettings[setting.key] ?? String(setting.value ?? '')
    const revealed = revealedSecrets.has(setting.key)

    if (isColor) {
      return (
        <div className="flex items-center gap-2">
          <input type="color" value={currentVal || '#000000'}
            onChange={e => handleChange(setting.key, e.target.value)}
            className="w-10 h-10 rounded-lg border border-white/[0.08] cursor-pointer bg-transparent p-0.5" />
          <input type="text" value={currentVal}
            onChange={e => handleChange(setting.key, e.target.value)}
            placeholder="#000000" maxLength={7}
            className={inputClass + ' flex-1 font-mono'} />
        </div>
      )
    }

    if (setting.type === 'boolean') {
      const isOn = currentVal === 'true' || currentVal === '1'
      return (
        <button onClick={() => handleChange(setting.key, isOn ? 'false' : 'true')}
          className={`relative w-12 h-6 rounded-full transition-colors ${isOn ? 'bg-emerald-500' : 'bg-white/[0.08]'}`}>
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${isOn ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      )
    }

    if (setting.type === 'integer') {
      return <input type="number" value={currentVal} onChange={e => handleChange(setting.key, e.target.value)} className={inputClass} />
    }

    if (setting.type === 'json') {
      return <textarea value={currentVal} onChange={e => handleChange(setting.key, e.target.value)}
        rows={3} className={inputClass + ' font-mono text-xs'} />
    }

    if (isSecret) {
      return (
        <div className="relative">
          <input
            type={revealed ? 'text' : 'password'}
            value={currentVal}
            onChange={e => handleChange(setting.key, e.target.value)}
            placeholder={setting.has_value ? (setting.masked || '••••••••') : 'Not configured'}
            className={inputClass + ' pr-10'}
          />
          <button onClick={() => toggleReveal(setting.key)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      )
    }

    // AI model dropdowns
    if (setting.key === 'ai_openai_model') {
      const models = [
        { value: 'gpt-5.4', label: 'GPT-5.4 (most capable)' },
        { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
        { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano (fastest)' },
        { value: 'gpt-4.1', label: 'GPT-4.1' },
        { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
        { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { value: 'o3-mini', label: 'o3-mini (reasoning)' },
      ]
      return (
        <select value={currentVal || 'gpt-4o'} onChange={e => handleChange(setting.key, e.target.value)} className={inputClass}>
          {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      )
    }

    if (setting.key === 'ai_anthropic_model') {
      const models = [
        { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (most capable)' },
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
        { value: 'claude-sonnet-4-6-20250610', label: 'Claude Sonnet 4.6' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
      ]
      return (
        <select value={currentVal || 'claude-sonnet-4-20250514'} onChange={e => handleChange(setting.key, e.target.value)} className={inputClass}>
          {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      )
    }

    return <input type="text" value={currentVal} onChange={e => handleChange(setting.key, e.target.value)} className={inputClass} />
  }

  const renderSettingRow = (setting: any) => (
    // Stack on mobile: 288px input next to a cramped label doesn't fit on a
    // phone. md+ goes back to the two-column row.
    <div key={setting.key} className="flex flex-col md:flex-row md:items-start gap-2 md:gap-4 py-3 border-b border-white/[0.04] last:border-0">
      <div className="flex-1 min-w-0 md:pt-1">
        <label className="block text-sm font-medium text-white">{setting.label}</label>
        {setting.description && <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>}
        {setting.source && (
          <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
            setting.source === 'database' ? 'bg-emerald-500/10 text-emerald-400'
            : setting.source === 'env' ? 'bg-amber-500/10 text-amber-400'
            : 'bg-white/[0.04] text-gray-600'
          }`}>
            {setting.source === 'database' ? <Database size={9} /> : setting.source === 'env' ? <Globe size={9} /> : null}
            {setting.source}
          </span>
        )}
      </div>
      <div className="w-full md:w-72 md:flex-shrink-0">{renderField(setting)}</div>
    </div>
  )

  /* ─── Tab: General ───────────────────────────────────────────────────── */

  const renderGeneral = () => (
    <div className="space-y-6">
      {/* Account */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Users size={15} className="text-emerald-400" /> Account
        </h3>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(116,200,149,0.2), rgba(116,200,149,0.05))' }}>
            <span className="text-lg font-bold text-emerald-400">{user?.name?.charAt(0) ?? 'A'}</span>
          </div>
          <div>
            <p className="font-semibold text-white">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <span className="inline-flex px-2 py-0.5 mt-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              {(user as any)?.staff?.role?.replace('_', ' ').toUpperCase() ?? 'ADMIN'}
            </span>
          </div>
        </div>
      </div>

      {/* General settings */}
      {groupSettings('general').length > 0 && (
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Settings2 size={15} className="text-emerald-400" /> General Settings
          </h3>
          {groupSettings('general').map(renderSettingRow)}
        </div>
      )}
    </div>
  )

  /* ─── Tab: Branding ──────────────────────────────────────────────────── */

  const renderBranding = () => {
    const activePreset = detectActivePreset()
    const previewPrimary = getVal('primary_color') || '#c9a84c'
    const previewBg = getVal('background_color') || '#0d0d0d'
    const previewSurface = getVal('surface_color') || '#161616'
    const previewText = getVal('text_color') || '#ffffff'
    const previewText2 = getVal('text_secondary_color') || '#8e8e93'
    const previewBorder = getVal('border_color') || '#2c2c2c'
    const previewAccent = getVal('accent_color') || '#32d74b'
    const previewError = getVal('error_color') || '#ff375f'

    return (
      <div className="space-y-6">
        {/* Logo */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <Upload size={15} className="text-emerald-400" /> Company Logo
          </h3>
          <p className="text-xs text-gray-500 mb-4">Displayed in the app header, member cards, and emails.</p>
          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
          <div className="flex items-center gap-6">
            <div className="flex-shrink-0">
              {logoPreview || currentLogoUrl ? (
                <div className="relative group">
                  <img src={logoPreview || currentLogoUrl!} alt="Logo"
                    className="h-20 max-w-[200px] object-contain rounded-xl border border-white/[0.06] bg-[#0a1410] p-2" />
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={() => logoInputRef.current?.click()}>
                    <Upload size={20} className="text-white" />
                  </div>
                </div>
              ) : (
                <div className="h-20 w-40 rounded-xl border-2 border-dashed border-white/[0.08] flex items-center justify-center cursor-pointer hover:border-emerald-500/40 transition-colors"
                  onClick={() => logoInputRef.current?.click()}>
                  <div className="text-center">
                    <Upload size={20} className="mx-auto text-gray-600 mb-1" />
                    <span className="text-xs text-gray-600">Upload Logo</span>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <button onClick={() => logoInputRef.current?.click()} disabled={logoMutation.isPending}
                className={btnPrimary + ' bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25'}>
                {logoMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                {logoMutation.isPending ? 'Uploading...' : (currentLogoUrl ? 'Change Logo' : 'Upload Logo')}
              </button>
              <p className="text-[10px] text-gray-600">PNG, JPG, SVG or WebP. Max 4 MB.</p>
            </div>
          </div>
        </div>

        {/* Theme Presets */}
        <div className={cardClass} style={cardStyle}>
          <div className="flex items-start justify-between mb-1 gap-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
              <Palette size={15} className="text-emerald-400" /> Theme Presets
              {activePreset && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  {activePreset} active
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              {undoSnapshot && (
                <button
                  onClick={undoPreset}
                  className="text-[11px] font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-400/30 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5"
                  title={`Revert to ${undoSnapshot.fromPresetName || 'previous colors'}`}
                >
                  <Undo2 size={11} />
                  Undo "{undoSnapshot.toPresetName}"
                </button>
              )}
              <button onClick={() => applyPreset(DEFAULT_PRESET)}
                className="text-[11px] text-gray-500 hover:text-emerald-400 transition-colors flex items-center gap-1">
                <RotateCcw size={11} /> Reset to default
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-4">Pick a curated palette to match your brand mood — applies instantly across the whole admin. Each card previews real UI bits in that theme so you can judge legibility before committing.</p>
          {/* Grid: featured presets span 2 columns so the row rhythm is
              irregular and the eye finds focal points. Non-featured presets
              stay at the standard 1-column width. The asymmetry is
              intentional — a uniform tile wall reads as 'samples' but
              varied sizes read as a curated showcase. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-fr">
            {Object.entries(PRESETS).map(([name, preset]) => (
              <PresetCard
                key={name}
                name={name}
                preset={preset}
                isActive={activePreset === name}
                onClick={() => applyPreset(name)}
              />
            ))}
          </div>
        </div>

        {/* Color Settings */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Palette size={15} className="text-emerald-400" /> Brand Colors
          </h3>
          {groupSettings('appearance').map(renderSettingRow)}
        </div>

        {/* Live Preview */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Eye size={15} className="text-emerald-400" /> Live Preview
          </h3>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: previewBorder, backgroundColor: previewBg }}>
            <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: previewSurface, borderBottom: `1px solid ${previewBorder}` }}>
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: previewPrimary }}>
                <span style={{ color: previewBg, fontSize: 10, fontWeight: 700 }}>H</span>
              </div>
              <span style={{ color: previewText, fontSize: 13, fontWeight: 600 }}>Hotel Loyalty</span>
              <div className="flex-1" />
              <span style={{ color: previewText2, fontSize: 11 }}>Admin</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-3">
                {['Dashboard', 'Members', 'Offers'].map((label, i) => (
                  <div key={label} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: i === 0 ? previewPrimary + '20' : 'transparent', color: i === 0 ? previewPrimary : previewText2 }}>
                    {label}
                  </div>
                ))}
              </div>
              <div className="rounded-lg p-3" style={{ backgroundColor: previewSurface, border: `1px solid ${previewBorder}` }}>
                <p style={{ color: previewText, fontSize: 13, fontWeight: 600 }}>Active Members</p>
                <p style={{ color: previewPrimary, fontSize: 20, fontWeight: 700 }}>1,247</p>
                <p style={{ color: previewText2, fontSize: 11 }}>+12% from last month</p>
              </div>
              <div className="flex gap-2">
                <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: previewPrimary, color: previewBg }}>Primary</div>
                <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: previewAccent + '20', color: previewAccent }}>Success</div>
                <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: previewError + '20', color: previewError }}>Error</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Tab: Mobile App ────────────────────────────────────────────────── */

  const renderMobileApp = () => {
    const m = (k: string, fallback: string) => getVal(`mobile_${k}`) || fallback
    const primary    = m('primary_color',        '#c9a84c')
    const bg         = m('background_color',     '#0d0d0d')
    const surface    = m('surface_color',        '#161616')
    const surface2   = m('secondary_color',      '#1e1e1e')
    const text       = m('text_color',           '#ffffff')
    const text2      = m('text_secondary_color', '#8e8e93')
    const border     = m('border_color',         '#2c2c2c')
    const success    = m('success_color',        '#32d74b')
    const errorCol   = m('error_color',          '#ff375f')
    const warning    = m('warning_color',        '#ffd60a')
    const info       = m('info_color',           '#0a84ff')
    const cardStyleVal = getVal('mobile_card_style') || 'gradient'
    const radius       = parseInt(getVal('mobile_radius') || '16')
    const buttonStyle  = getVal('mobile_button_style') || 'filled'
    const accentIntensity = getVal('mobile_accent_intensity') || 'vibrant'

    const applyMobilePreset = (preset: Record<string, string>, presetName?: string) => {
      const updates: Record<string, string> = {}
      for (const [k, v] of Object.entries(preset)) updates[`mobile_${k}`] = v
      setEditedSettings(prev => ({ ...prev, ...updates }))
      // Save the picked preset name alongside the per-color rows so
      // the "X active" chip lights up correctly after refresh -- and
      // doesn't depend on every single hex matching byte-for-byte
      // (which loses to manual tweaks).
      const settings = [
        ...Object.entries(updates).map(([key, value]) => ({ key, value })),
        ...(presetName ? [{ key: 'mobile_preset_name', value: presetName }] : []),
      ]
      saveMutation.mutate(settings)
    }

    const MOBILE_PRESETS: { name: string; description: string; colors: Record<string, string> }[] = [
      { name: 'Gold Classic', description: 'Default — warm gold on near-black', colors: {
        primary_color: '#c9a84c', background_color: '#0d0d0d', surface_color: '#161616', secondary_color: '#1e1e1e',
        text_color: '#ffffff', text_secondary_color: '#8e8e93', border_color: '#2c2c2c',
        success_color: '#32d74b', error_color: '#ff375f', warning_color: '#ffd60a', info_color: '#0a84ff' } },
      { name: 'Royal Sapphire', description: 'Deep navy with crisp blue accents', colors: {
        primary_color: '#3b82f6', background_color: '#0a0f1e', surface_color: '#111827', secondary_color: '#1f2937',
        text_color: '#f8fafc', text_secondary_color: '#94a3b8', border_color: '#1f2a3a',
        success_color: '#22c55e', error_color: '#ef4444', warning_color: '#eab308', info_color: '#06b6d4' } },
      { name: 'Emerald Spa', description: 'Calming green for wellness brands', colors: {
        primary_color: '#10b981', background_color: '#06120c', surface_color: '#0f1f17', secondary_color: '#162a1f',
        text_color: '#f0fdf4', text_secondary_color: '#86efac', border_color: '#1e3a2f',
        success_color: '#22c55e', error_color: '#f43f5e', warning_color: '#fbbf24', info_color: '#38bdf8' } },
      { name: 'Rose Boutique', description: 'Warm rose for boutique hotels', colors: {
        primary_color: '#e11d48', background_color: '#0f0708', surface_color: '#1c1017', secondary_color: '#2a1620',
        text_color: '#fff1f2', text_secondary_color: '#fda4af', border_color: '#3b1524',
        success_color: '#10b981', error_color: '#dc2626', warning_color: '#facc15', info_color: '#60a5fa' } },
      { name: 'Ocean Resort', description: 'Cyan & violet for coastal properties', colors: {
        primary_color: '#06b6d4', background_color: '#04141c', surface_color: '#0f2937', secondary_color: '#163847',
        text_color: '#ecfeff', text_secondary_color: '#67e8f9', border_color: '#164e63',
        success_color: '#22c55e', error_color: '#fb7185', warning_color: '#fde047', info_color: '#818cf8' } },
      { name: 'Champagne Lux', description: 'Refined champagne on warm dark', colors: {
        primary_color: '#d4af37', background_color: '#100e0a', surface_color: '#1c1814', secondary_color: '#2a2418',
        text_color: '#fdf6e3', text_secondary_color: '#c4a476', border_color: '#2e2820',
        success_color: '#22c55e', error_color: '#e25555', warning_color: '#f5b400', info_color: '#5ec4e8' } },
      { name: 'Midnight Violet', description: 'Deep purple luxury for premium brands', colors: {
        primary_color: '#8b5cf6', background_color: '#0c0a14', surface_color: '#15112a', secondary_color: '#1e1836',
        text_color: '#f5f3ff', text_secondary_color: '#a78bfa', border_color: '#2e2654',
        success_color: '#34d399', error_color: '#f87171', warning_color: '#fbbf24', info_color: '#38bdf8' } },
      { name: 'Tropical Sunset', description: 'Warm coral & amber for island resorts', colors: {
        primary_color: '#f97316', background_color: '#120a06', surface_color: '#1e1410', secondary_color: '#2a1e18',
        text_color: '#fff7ed', text_secondary_color: '#fdba74', border_color: '#3d2a1e',
        success_color: '#4ade80', error_color: '#ef4444', warning_color: '#fde047', info_color: '#67e8f9' } },
      { name: 'Alpine Lodge', description: 'Earthy tones for mountain retreats', colors: {
        primary_color: '#78716c', background_color: '#0e0d0b', surface_color: '#1c1a17', secondary_color: '#292521',
        text_color: '#fafaf9', text_secondary_color: '#a8a29e', border_color: '#33302c',
        success_color: '#86efac', error_color: '#fca5a5', warning_color: '#fcd34d', info_color: '#93c5fd' } },
      { name: 'Urban Loft', description: 'Sleek monochrome for city hotels', colors: {
        primary_color: '#f5f5f5', background_color: '#09090b', surface_color: '#141416', secondary_color: '#1e1e22',
        text_color: '#fafafa', text_secondary_color: '#71717a', border_color: '#27272a',
        success_color: '#22c55e', error_color: '#ef4444', warning_color: '#eab308', info_color: '#3b82f6' } },
      { name: 'Desert Oasis', description: 'Terracotta & sand for desert properties', colors: {
        primary_color: '#c2410c', background_color: '#0f0a07', surface_color: '#1a140e', secondary_color: '#261e16',
        text_color: '#fef3c7', text_secondary_color: '#d6a56a', border_color: '#3b2e20',
        success_color: '#4ade80', error_color: '#fb923c', warning_color: '#fde68a', info_color: '#7dd3fc' } },
      { name: 'Nordic Ice', description: 'Cool minimalist for Scandinavian brands', colors: {
        primary_color: '#0ea5e9', background_color: '#070c10', surface_color: '#0e1620', secondary_color: '#162032',
        text_color: '#f0f9ff', text_secondary_color: '#7dd3fc', border_color: '#1e3048',
        success_color: '#34d399', error_color: '#fb7185', warning_color: '#fde047', info_color: '#a78bfa' } },
    ]

    // Detect active mobile preset
    const activeMobilePreset = (() => {
      // Server-stored name wins (added in 2026-06 — survives any single-
      // color tweak the admin makes after picking the preset).
      const stored = getVal('mobile_preset_name')
      if (stored && MOBILE_PRESETS.some(p => p.name === stored)) return stored

      // Legacy detection for orgs that picked a preset before the name
      // started persisting.
      const cur: Record<string, string> = {
        primary_color: primary, background_color: bg, surface_color: surface, secondary_color: surface2,
        text_color: text, text_secondary_color: text2, border_color: border,
        success_color: success, error_color: errorCol, warning_color: warning, info_color: info,
      }
      for (const p of MOBILE_PRESETS) {
        if (Object.keys(p.colors).every(k => cur[k]?.toLowerCase() === p.colors[k]?.toLowerCase())) return p.name
      }
      return null
    })()

    return (
      <div className="space-y-6">
        {/* Intro */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <Smartphone size={15} className="text-emerald-400" /> Loyalty Mobile App Theme
          </h3>
          <p className="text-xs text-gray-500">
            These colors apply to the <strong className="text-gray-300">Loyalty Member app</strong> and the <strong className="text-gray-300">Loyalty Staff app</strong>.
            Configured separately from the web admin theme — apps fetch the latest colors on launch, no rebuild required.
          </p>
        </div>

        {/* Layout: presets + settings on left, live phone preview on right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Mobile Presets */}
            <div className={cardClass} style={cardStyle}>
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette size={15} className="text-emerald-400" /> Mobile Presets
                  {activeMobilePreset && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      {activeMobilePreset} active
                    </span>
                  )}
                </h3>
                <button onClick={() => applyMobilePreset(MOBILE_PRESETS[0].colors, MOBILE_PRESETS[0].name)}
                  className="text-[11px] text-gray-500 hover:text-emerald-400 transition-colors flex items-center gap-1">
                  <RotateCcw size={11} /> Reset
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-4">Tap to apply — saves instantly and updates the preview.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {MOBILE_PRESETS.map(preset => {
                  const c = preset.colors
                  const isActive = activeMobilePreset === preset.name
                  return (
                    <button key={preset.name} onClick={() => applyMobilePreset(c, preset.name)}
                      className={`text-left rounded-xl overflow-hidden border transition-all hover:-translate-y-px hover:shadow-lg ${
                        isActive ? 'border-emerald-500/50 shadow-[0_0_0_1px_rgba(116,200,149,0.3)]' : 'border-white/[0.06] hover:border-emerald-500/30'
                      }`}
                      style={{ background: c.surface_color }}>
                      <div className="h-8 flex">
                        <div className="flex-1" style={{ backgroundColor: c.primary_color }} />
                        <div className="flex-1" style={{ backgroundColor: c.background_color }} />
                        <div className="flex-1" style={{ backgroundColor: c.success_color }} />
                        <div className="flex-1" style={{ backgroundColor: c.info_color }} />
                      </div>
                      <div className="p-2" style={{ backgroundColor: c.background_color }}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-bold" style={{ color: c.text_color }}>{preset.name}</span>
                          {isActive && <CheckCircle size={10} style={{ color: c.primary_color }} />}
                        </div>
                        <p className="text-[8px] leading-snug line-clamp-1" style={{ color: c.text_secondary_color }}>
                          {preset.description}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Loyalty Card Style + Radius */}
            <div className={cardClass} style={cardStyle}>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <CreditCard size={15} className="text-emerald-400" /> Card Style
              </h3>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {(['gradient', 'solid', 'glass'] as const).map(style => (
                  <button key={style} onClick={() => handleChange('mobile_card_style', style)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-semibold capitalize transition-all ${
                      cardStyleVal === style
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                        : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:border-emerald-500/30'
                    }`}>
                    {style}
                  </button>
                ))}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">Corner Radius</label>
                  <span className="text-xs font-mono text-emerald-400">{radius}px</span>
                </div>
                <input type="range" min="0" max="32" value={radius}
                  onChange={e => handleChange('mobile_radius', e.target.value)}
                  className="w-full accent-emerald-500" />
              </div>

              {/* Button Style */}
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <label className="text-xs text-gray-400 mb-2 block">Button Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['filled', 'outline', 'soft'] as const).map(style => (
                    <button key={style} onClick={() => handleChange('mobile_button_style', style)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-semibold capitalize transition-all ${
                        buttonStyle === style
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:border-emerald-500/30'
                      }`}>
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent Intensity */}
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <label className="text-xs text-gray-400 mb-2 block">Accent Intensity</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['subtle', 'vibrant', 'bold'] as const).map(intensity => (
                    <button key={intensity} onClick={() => handleChange('mobile_accent_intensity', intensity)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-semibold capitalize transition-all ${
                        accentIntensity === intensity
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:border-emerald-500/30'
                      }`}>
                      {intensity}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Color settings */}
            <div className={cardClass} style={cardStyle}>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Palette size={15} className="text-emerald-400" /> Mobile Colors
              </h3>
              <p className="text-xs text-gray-500 mb-2">Fine-tune individual colors. Changes save when you click Save.</p>
              {groupSettings('mobile_app').filter(s => s.key.startsWith('mobile_') && s.key !== 'mobile_card_style' && s.key !== 'mobile_radius').map(renderSettingRow)}
            </div>
          </div>

          {/* Right column — Live phone preview */}
          <div className="lg:col-span-1">
            <div className={cardClass + ' lg:sticky lg:top-4'} style={cardStyle}>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Eye size={15} className="text-emerald-400" /> Live Preview
              </h3>
              {/* Phone frame */}
              <div className="mx-auto" style={{ maxWidth: 280 }}>
                <div className="rounded-[36px] p-2 border-4 border-gray-800 shadow-2xl"
                  style={{ background: '#000' }}>
                  <div className="rounded-[28px] overflow-hidden" style={{ background: bg, height: 540 }}>
                    {/* Status bar */}
                    <div className="px-5 pt-2 pb-1 flex items-center justify-between text-[10px]" style={{ color: text }}>
                      <span>9:41</span>
                      <span>•••</span>
                    </div>
                    {/* Header */}
                    <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: surface, borderBottom: `1px solid ${border}` }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
                        style={{ backgroundColor: primary, color: bg }}>H</div>
                      <span className="text-xs font-bold" style={{ color: text }}>Hotel Loyalty</span>
                    </div>
                    {/* Loyalty card hero */}
                    <div className="px-4 pt-4">
                      <div
                        className="p-4 relative overflow-hidden"
                        style={{
                          borderRadius: radius,
                          background:
                            cardStyleVal === 'gradient'
                              ? `linear-gradient(135deg, ${primary} 0%, ${primary}99 60%, ${surface2} 100%)`
                              : cardStyleVal === 'glass'
                                ? `${primary}25`
                                : primary,
                          border: cardStyleVal === 'glass' ? `1px solid ${primary}50` : 'none',
                          backdropFilter: cardStyleVal === 'glass' ? 'blur(8px)' : undefined,
                        }}>
                        <p className="text-[9px] uppercase tracking-wider opacity-80" style={{ color: cardStyleVal === 'glass' ? text : bg }}>Gold Member</p>
                        <p className="text-[11px] mt-0.5" style={{ color: cardStyleVal === 'glass' ? text : bg }}>Sarah Johnson</p>
                        <div className="flex items-end justify-between mt-3">
                          <div>
                            <p className="text-[9px] opacity-70" style={{ color: cardStyleVal === 'glass' ? text2 : bg }}>Points</p>
                            <p className="text-xl font-bold" style={{ color: cardStyleVal === 'glass' ? text : bg }}>2,485</p>
                          </div>
                          <CreditCard size={20} style={{ color: cardStyleVal === 'glass' ? text : bg, opacity: 0.7 }} />
                        </div>
                      </div>
                    </div>
                    {/* Stats row */}
                    <div className="px-4 mt-3 grid grid-cols-3 gap-2">
                      {[
                        { label: 'Visits', value: '12', color: success },
                        { label: 'Tier', value: 'Gold', color: warning },
                        { label: 'Offers', value: '4', color: info },
                      ].map(stat => (
                        <div key={stat.label} className="p-2 text-center"
                          style={{ borderRadius: radius * 0.6, backgroundColor: surface2, border: `1px solid ${border}` }}>
                          <p className="text-sm font-bold" style={{ color: stat.color }}>{stat.value}</p>
                          <p className="text-[8px] uppercase" style={{ color: text2 }}>{stat.label}</p>
                        </div>
                      ))}
                    </div>
                    {/* List item */}
                    <div className="px-4 mt-3">
                      <div className="p-2.5 flex items-center gap-2" style={{ borderRadius: radius * 0.7, backgroundColor: surface2, border: `1px solid ${border}` }}>
                        <div className="w-8 h-8 flex items-center justify-center" style={{ borderRadius: radius * 0.5, backgroundColor: primary + '25' }}>
                          <Star size={14} style={{ color: primary }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold truncate" style={{ color: text }}>15% off Spa Treatment</p>
                          <p className="text-[8px]" style={{ color: text2 }}>Expires in 7 days</p>
                        </div>
                        <span className="text-[9px] font-bold px-1.5 py-0.5" style={{ color: errorCol, backgroundColor: errorCol + '20', borderRadius: radius * 0.3 }}>NEW</span>
                      </div>
                    </div>
                    {/* Bottom button */}
                    <div className="px-4 mt-3">
                      <div className="py-2.5 text-center text-[10px] font-bold"
                        style={{
                          borderRadius: radius * 0.7,
                          backgroundColor: buttonStyle === 'filled' ? primary : buttonStyle === 'soft' ? primary + '20' : 'transparent',
                          color: buttonStyle === 'filled' ? bg : primary,
                          border: buttonStyle === 'outline' ? `2px solid ${primary}` : 'none',
                        }}>
                        Redeem Now
                      </div>
                    </div>
                    {/* Tab bar */}
                    <div className="absolute bottom-0 left-0 right-0 px-4 py-2 flex items-center justify-around"
                      style={{ borderTop: `1px solid ${border}`, backgroundColor: surface }}>
                      {[
                        { Icon: Star, active: true },
                        { Icon: CreditCard, active: false },
                        { Icon: Bell, active: false },
                        { Icon: Settings2, active: false },
                      ].map(({ Icon, active }, i) => (
                        <Icon key={i} size={16} style={{ color: active ? primary : text2 }} />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-center text-gray-600 mt-2">Live preview — updates as you tweak colors</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Tab: Loyalty ───────────────────────────────────────────────────── */

  const renderLoyalty = () => {
    const tiers = tiersData?.tiers ?? []
    const welcomeBonus = parseInt(getVal('welcome_bonus_points') || '0')
    const pointsPerDollar = parseInt(getVal('points_per_dollar') || '0')
    const referrerBonus = parseInt(getVal('referrer_bonus_points') || '0')
    const refereeBonus = parseInt(getVal('referee_bonus_points') || '0')
    const minRedeem = parseInt(getVal('min_redeem_points') || '0')
    const expiryMonths = parseInt(getVal('points_expiry_months') || '0')
    const qualModel = getVal('tier_qualification_model') || 'points'

    const managePages = [
      { to: '/program?tab=tiers',    label: 'Tiers',    icon: <Crown size={16} />,        desc: `${tiers.length} tier${tiers.length === 1 ? '' : 's'} · qualification rules, perks`, accent: '#fbbf24' },
      { to: '/program?tab=benefits', label: 'Benefits', icon: <ShieldCheck size={16} />,  desc: 'Reusable benefits assigned to tiers',           accent: '#a78bfa' },
      { to: '/rewards?tab=offers',   label: 'Offers',   icon: <Tag size={16} />,          desc: 'Targeted promotions & reward redemptions',        accent: '#60a5fa' },
      { to: '/members',              label: 'Members',  icon: <Users size={16} />,        desc: 'Member directory, points ledger, tier overrides', accent: '#74c895' },
      { to: '/wallet-config',        label: 'Wallet passes', icon: <CreditCard size={16} />, desc: 'Apple + Google Wallet pass setup',              accent: '#f59e0b' },
    ]

    return (
    <div className="space-y-6">
      {/* Program health snapshot — unique to Settings (reflects hotel_settings DB values, not member stats) */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Star size={15} className="text-emerald-400" /> Program Configuration
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Welcome Bonus',      value: welcomeBonus.toLocaleString() + ' pts', sub: 'awarded on signup',    color: '#fbbf24' },
            { label: 'Earn Rate',          value: pointsPerDollar + ' pts/$',              sub: 'base earning rate',    color: '#60a5fa' },
            { label: 'Min Redeem',         value: minRedeem.toLocaleString() + ' pts',     sub: 'redemption threshold', color: '#a78bfa' },
            { label: 'Qualification',      value: qualModel.charAt(0).toUpperCase() + qualModel.slice(1), sub: 'tier assessment model', color: '#74c895' },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl p-3 border border-white/[0.04]"
              style={{ background: 'rgba(15,28,24,0.5)' }}>
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{stat.label}</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Quick health indicators */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-white/[0.04]">
          {referrerBonus > 0 && refereeBonus > 0 ? (
            <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
              <CheckCircle size={10} className="inline -mt-px mr-1" />
              Referral live — referrer {referrerBonus} / referee {refereeBonus} pts
            </span>
          ) : (
            <span className="text-[11px] px-2 py-1 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/15">
              <XCircle size={10} className="inline -mt-px mr-1" />
              Referral rewards not configured
            </span>
          )}
          {expiryMonths > 0 ? (
            <span className="text-[11px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/15">
              <Clock size={10} className="inline -mt-px mr-1" />
              Points expire after {expiryMonths} months
            </span>
          ) : (
            <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
              <CheckCircle size={10} className="inline -mt-px mr-1" />
              Points never expire
            </span>
          )}
          {tiers.length > 0 ? (
            <span className="text-[11px] px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15">
              <Layers size={10} className="inline -mt-px mr-1" />
              {tiers.length} tier{tiers.length === 1 ? '' : 's'} configured
            </span>
          ) : (
            <span className="text-[11px] px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/15">
              <XCircle size={10} className="inline -mt-px mr-1" />
              No tiers yet — set up in Tiers page
            </span>
          )}
        </div>
      </div>

      {/* Points settings — the only settings that truly belong here */}
      {groupSettings('points').length > 0 && (
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <Gift size={15} className="text-emerald-400" /> Points & Rewards Rules
          </h3>
          <p className="text-[11px] text-gray-500 mb-3">
            Global defaults for how points are earned, expire, redeemed, and authorised for staff awards.
          </p>
          {groupSettings('points').map(renderSettingRow)}
        </div>
      )}

      {/* Manage loyalty content — in-app navigation, replaces the duplicated tier list */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <Layers size={15} className="text-emerald-400" /> Manage Loyalty Content
        </h3>
        <p className="text-[11px] text-gray-500 mb-4">
          Tiers, benefits, offers and member records are managed in their dedicated sections to avoid duplication.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {managePages.map(page => (
            <Link key={page.to} to={page.to}
              className="flex items-center gap-3 p-3 rounded-xl border border-white/[0.04] hover:border-emerald-500/20 transition-all hover:-translate-y-px group"
              style={{ background: 'rgba(15,28,24,0.5)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: page.accent + '18', color: page.accent }}>
                {page.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">{page.label}</p>
                <p className="text-[11px] text-gray-500 truncate">{page.desc}</p>
              </div>
              <ChevronRight size={14} className="text-gray-600 group-hover:text-emerald-400 transition-colors" />
            </Link>
          ))}
        </div>

        {/* Tier roster preview — icons match the Tiers page */}
        {!tiersLoading && tiers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/[0.04]">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2">Current Tiers</p>
            <div className="flex flex-wrap gap-2">
              {tiers.map((tier: any) => {
                const TierIcon = tierIconComponent(tier.icon)
                const color = tier.color_hex ?? TIER_COLORS[tier.name] ?? '#94a3b8'
                return (
                  <Link key={tier.id} to="/tiers"
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border hover:-translate-y-px transition-all"
                    style={{ background: color + '12', borderColor: color + '30' }}
                    title={`${tier.member_count} members · ${tier.min_points.toLocaleString()}${tier.max_points ? '–' + tier.max_points.toLocaleString() : '+'} pts`}>
                    <TierIcon size={14} style={{ color }} />
                    <span className="text-xs font-semibold" style={{ color }}>{tier.name}</span>
                    <span className="text-[10px] text-gray-500">{tier.earn_rate}x</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
    )
  }

  /* ─── Tab: Integrations ──────────────────────────────────────────────── */

  const renderIntegrations = () => {
    const intSettings = groupSettings('integrations')

    type Section = { id: string; title: string; subtitle: string; icon: any; keys: string[]; testType?: string; comingSoon?: boolean }

    // ── PMS / Booking Engines ──
    // Only Smoobu has a real backend client + sync pipeline today. The
    // others are catalogued so admins know they're on the roadmap, but
    // marked `comingSoon: true` — credential inputs are disabled so we
    // don't leave staff thinking they've connected something that
    // silently does nothing.
    const pmsSections: Section[] = [
      { id: 'smoobu',           title: 'Smoobu',            subtitle: 'All-in-one vacation rental PMS & channel manager',    icon: Calendar,  keys: ['booking_smoobu_api_key', 'booking_smoobu_channel_id', 'booking_smoobu_base_url', 'booking_smoobu_webhook_secret'], testType: 'smoobu' },
      { id: 'cloudbeds',        title: 'Cloudbeds',         subtitle: 'Hotel & hostel PMS with built-in booking engine',     icon: Calendar,  keys: ['cloudbeds_api_key', 'cloudbeds_property_id', 'cloudbeds_client_id', 'cloudbeds_client_secret'], comingSoon: true },
      { id: 'mews',             title: 'Mews',              subtitle: 'Modern cloud-native PMS for hotels & hostels',        icon: Calendar,  keys: ['mews_access_token', 'mews_client_token', 'mews_platform_url'], comingSoon: true },
      { id: 'guesty',           title: 'Guesty',            subtitle: 'Vacation rental & short-term property management',    icon: Calendar,  keys: ['guesty_api_key', 'guesty_api_secret', 'guesty_account_id'], comingSoon: true },
      { id: 'hostaway',         title: 'Hostaway',          subtitle: 'Vacation rental management & channel distribution',   icon: Calendar,  keys: ['hostaway_api_key', 'hostaway_account_id'], comingSoon: true },
      { id: 'beds24',           title: 'Beds24',            subtitle: 'Channel manager & PMS for all property types',        icon: Calendar,  keys: ['beds24_api_key', 'beds24_property_id'], comingSoon: true },
      { id: 'lodgify',          title: 'Lodgify',           subtitle: 'Vacation rental software with booking website',       icon: Calendar,  keys: ['lodgify_api_key', 'lodgify_property_id'], comingSoon: true },
      { id: 'little_hotelier',  title: 'Little Hotelier',   subtitle: 'Small hotel & B&B management system',                icon: Calendar,  keys: ['little_hotelier_api_key', 'little_hotelier_property_id'], comingSoon: true },
      { id: 'roomraccoon',      title: 'RoomRaccoon',       subtitle: 'Hotel management with revenue optimization',          icon: Calendar,  keys: ['roomraccoon_api_key', 'roomraccoon_property_id'], comingSoon: true },
    ]

    // ── OTA / Channels ──
    // None of these have direct API integrations in our backend today —
    // OTA reservations come in through whichever PMS (e.g. Smoobu) the
    // hotel has connected, which already syncs them via channels. Direct
    // OTA APIs require partner approval from each provider and are on
    // the roadmap once the integration template stabilises.
    const channelSections: Section[] = [
      { id: 'booking_com', title: 'Booking.com',  subtitle: 'Direct connectivity API — reservations currently flow via your PMS', icon: Globe, keys: ['booking_com_hotel_id', 'booking_com_api_key'], comingSoon: true },
      { id: 'airbnb',      title: 'Airbnb',       subtitle: 'Host API — reservations currently flow via your PMS',                icon: Globe, keys: ['airbnb_api_key', 'airbnb_listing_ids'], comingSoon: true },
      { id: 'expedia',     title: 'Expedia',      subtitle: 'EPS API — reservations currently flow via your PMS',                 icon: Globe, keys: ['expedia_api_key', 'expedia_property_id'], comingSoon: true },
    ]

    // ── Payments & Communication ──
    const serviceSections: Section[] = [
      { id: 'stripe',    title: 'Stripe',              subtitle: 'Payment processing for bookings & invoices',  icon: CreditCard,    keys: ['stripe_publishable_key', 'stripe_secret_key', 'stripe_webhook_secret', 'stripe_currency'], testType: 'stripe' },
      { id: 'mail',      title: 'Email / SMTP',        subtitle: 'Transactional emails & notifications',        icon: Mail,          keys: ['mail_host', 'mail_port', 'mail_username', 'mail_password', 'mail_from_address', 'mail_from_name'], testType: 'mail' },
      { id: 'twilio',    title: 'Twilio',              subtitle: 'SMS notifications & booking confirmations',   icon: Phone,         keys: ['twilio_account_sid', 'twilio_auth_token', 'twilio_phone_number'], testType: 'twilio' },
      { id: 'whatsapp',  title: 'WhatsApp Business',   subtitle: 'Guest messaging via Meta Cloud API',          icon: MessageSquare, keys: ['whatsapp_phone_id', 'whatsapp_access_token', 'whatsapp_verify_token'], testType: 'whatsapp' },
      { id: 'expo',      title: 'Push Notifications',  subtitle: 'Expo push service for mobile app',            icon: Smartphone,    keys: ['expo_access_token'], testType: 'expo' },
      { id: 'google',    title: 'Google Services',     subtitle: 'Maps, Analytics & Tag Manager',               icon: Map,           keys: ['google_maps_api_key', 'google_analytics_id', 'google_tag_manager_id'], testType: 'google_maps' },
      { id: 'webhooks',  title: 'Webhooks & Zapier',   subtitle: 'Outbound event notifications & automation',   icon: Link2,         keys: ['zapier_webhook_url', 'custom_webhook_url', 'custom_webhook_secret'], comingSoon: true },
    ]

    const allSections = [
      { label: 'Property Management Systems', sections: pmsSections },
      { label: 'OTA & Channels', sections: channelSections },
      { label: 'Payments & Communication', sections: serviceSections },
    ]

    const renderSection = (section: Section) => {
      const items = section.keys.map(k => intSettings.find((s: any) => s.key === k)).filter(Boolean)
      if (items.length === 0) return null
      const isOpen = expandedSections.has(section.id)
      const result = section.testType ? testResults[section.testType] : null
      const hasAnyValue = items.some((s: any) => s.has_value)
      const enabledKey = `${section.id}_enabled`
      const enabledRaw = getVal(enabledKey)
      const isEnabled = enabledRaw === '' ? true : enabledRaw === 'true' || enabledRaw === '1'
      const isComingSoon = !!section.comingSoon
      const toggleEnabled = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (isComingSoon) return
        const next = !isEnabled
        setEditedSettings(prev => ({ ...prev, [enabledKey]: String(next) }))
        saveMutation.mutate([{ key: enabledKey, value: String(next) }])
      }
      const showActive = hasAnyValue && isEnabled && !isComingSoon

      return (
        <div key={section.id} className={`rounded-2xl border overflow-hidden transition-all ${isComingSoon ? 'border-white/[0.04] opacity-60' : 'border-white/[0.06]'}`}
          style={{
            background: result
              ? result.success
                ? 'linear-gradient(180deg, rgba(18,28,22,0.96), rgba(14,22,18,0.98)), radial-gradient(circle at 100% 0, rgba(116,200,149,0.06), transparent 40%)'
                : 'linear-gradient(180deg, rgba(28,18,18,0.96), rgba(22,14,14,0.98)), radial-gradient(circle at 100% 0, rgba(228,132,111,0.06), transparent 40%)'
              : 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))',
            boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
          }}>
          <button onClick={() => isComingSoon ? null : toggleSection(section.id)}
            disabled={isComingSoon}
            className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${isComingSoon ? 'cursor-not-allowed' : 'hover:bg-white/[0.02]'}`}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: showActive ? 'rgba(116,200,149,0.12)' : 'rgba(255,255,255,0.04)' }}>
              <section.icon size={15} className={showActive ? 'text-emerald-400' : 'text-gray-500'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-bold ${isEnabled && !isComingSoon ? 'text-white' : 'text-gray-500'}`}>{section.title}</span>
                {isComingSoon && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Coming Soon
                  </span>
                )}
                {!isComingSoon && showActive && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">Active</span>}
                {!isComingSoon && hasAnyValue && !isEnabled && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/15">Disabled</span>}
                {result && (
                  <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${result.success ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                    {result.success ? <CheckCircle size={8} /> : <XCircle size={8} />} {result.message}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">{section.subtitle}</p>
            </div>
            {!isComingSoon && hasAnyValue && (
              <span onClick={toggleEnabled} role="switch" aria-checked={isEnabled}
                title={isEnabled ? 'Click to deactivate (credentials kept; data sync stops)' : 'Click to reactivate'}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${isEnabled ? 'bg-emerald-500/70' : 'bg-gray-600/60'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </span>
            )}
            {!isComingSoon && (
              <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            )}
          </button>
          {!isComingSoon && isOpen && (
            <div className="px-5 pb-4 border-t border-white/[0.04]">
              {section.testType && (
                <div className="flex items-center justify-between pt-3 pb-1">
                  {!isEnabled && hasAnyValue ? (
                    <p className="text-[11px] text-gray-500">Integration is deactivated — sync paused. Credentials are kept; flip the toggle above to resume.</p>
                  ) : <span />}
                  <button onClick={() => testConnection(section.testType!)}
                    disabled={testingIntegration === section.testType || !isEnabled}
                    className={btnPrimary + ' bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 disabled:opacity-40 text-xs'}>
                    {testingIntegration === section.testType ? <><RefreshCw size={12} className="animate-spin" /> Testing...</> : <><Wifi size={12} /> Test Connection</>}
                  </button>
                </div>
              )}
              {/* Backend advisory banner — surfaced via testResults[type].warning.
                  The Stripe integration uses this to flag a restricted-key
                  rk_live_* missing the refunds:write scope (the situation that
                  blocked Forrest Glamp refunds). Visible as long as the test
                  result carries a warning — clearing it requires re-running
                  the test with a fixed key. */}
              {result?.warning && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5 flex items-start gap-3">
                  <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-amber-200">{result.warning.title}</p>
                    <p className="text-[11px] text-amber-100/80 mt-1 leading-relaxed whitespace-pre-line">{result.warning.message}</p>
                  </div>
                </div>
              )}
              {/* Per-org Smoobu webhook URL helper. Customers need to
                  paste THIS URL into Smoobu's webhook settings — the
                  ?org= token routes the delivery to their org so we
                  can verify against their booking_smoobu_webhook_secret
                  (not the platform's global secret). Shown regardless
                  of activation state so it's discoverable during setup. */}
              {section.id === 'smoobu' && (() => {
                const widgetToken = settingsData?.widget_token || ''
                const webhookUrl = widgetToken
                  ? `${window.location.origin}/api/v1/booking/webhooks/smoobu?org=${widgetToken}`
                  : ''
                const copyUrl = () => {
                  if (!webhookUrl) return
                  navigator.clipboard.writeText(webhookUrl)
                    .then(() => toast.success('Webhook URL copied'))
                    .catch(() => toast.error('Could not copy'))
                }
                return (
                  <div className="mt-3 mb-1 rounded-xl border border-blue-500/15 bg-blue-500/[0.03] p-3 text-xs">
                    <div className="flex items-center gap-2 mb-1.5 text-blue-300/90">
                      <Link2 size={12} />
                      <span className="font-semibold uppercase tracking-wider text-[10px]">Smoobu webhook URL</span>
                    </div>
                    <p className="text-gray-500 text-[11px] mb-2 leading-relaxed">
                      Paste this URL into Smoobu → Settings → Webhooks. The <code className="font-mono text-blue-300">?org=</code> token routes deliveries to your org and verifies against the webhook secret above. Smoobu also sends the secret in the <code className="font-mono text-blue-300">X-Webhook-Secret</code> header.
                    </p>
                    {widgetToken ? (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-2 py-1.5 rounded bg-black/30 text-emerald-300 font-mono text-[10px] break-all">
                          {webhookUrl}
                        </code>
                        <button onClick={copyUrl}
                          className={btnPrimary + ' bg-blue-500/15 text-blue-300 border border-blue-500/20 hover:bg-blue-500/25 text-[11px] px-3 py-1.5 flex-shrink-0'}>
                          <Copy size={11} /> Copy
                        </button>
                      </div>
                    ) : (
                      <p className="text-amber-400 text-[11px]">Widget token not loaded yet — refresh the page.</p>
                    )}
                  </div>
                )
              })()}
              {/* Discover Smoobu channels — fetches GET /channels and lets
                  the admin pick the correct direct-booking channel id.
                  Without this, widget bookings end up grey-coded as
                  Smoobu's "Blocked Channel" because our auto-detect can't
                  reliably tell apart direct/website/manual channels from
                  blocked / OTA ones across every account setup. */}
              {section.id === 'smoobu' && hasAnyValue && isEnabled && (
                <div className="mt-3 mb-1 rounded-xl border border-amber-500/15 bg-amber-500/[0.03] p-3 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 text-amber-300/90">
                      <Calendar size={12} />
                      <span className="font-semibold uppercase tracking-wider text-[10px]">Smoobu channel</span>
                    </div>
                    <button
                      onClick={async () => {
                        setLoadingSmoobuChannels(true)
                        try {
                          const { data } = await api.get('/v1/admin/bookings/smoobu-channels')
                          setSmoobuChannels(data)
                        } catch (e: any) {
                          toast.error(e?.response?.data?.error || 'Could not fetch channels')
                        }
                        setLoadingSmoobuChannels(false)
                      }}
                      disabled={loadingSmoobuChannels}
                      className={btnPrimary + ' bg-amber-500/15 text-amber-300 border border-amber-500/20 hover:bg-amber-500/25 text-[11px] px-3 py-1.5 disabled:opacity-40'}>
                      {loadingSmoobuChannels ? <><RefreshCw size={11} className="animate-spin" /> Loading…</> : <><RefreshCw size={11} /> Discover channels</>}
                    </button>
                  </div>
                  <p className="text-gray-500 text-[11px] mb-2 leading-relaxed">
                    Widget bookings need to be attributed to a specific Smoobu channel. If the Channel ID below is blank or wrong, new bookings show up grey-striped on the Smoobu calendar as <strong className="text-amber-400">"Blocked Channel"</strong> and don't appear in New Reservations. Click <strong>Discover channels</strong> to list your Smoobu channels, then click the one to use.
                  </p>
                  {smoobuChannels && (
                    <div className="mt-2 space-y-1">
                      {smoobuChannels.channels.length === 0 && (
                        <p className="text-gray-500 italic">No channels returned — check API key + base URL.</p>
                      )}
                      {smoobuChannels.channels.map((c: any) => {
                        const id = String(c.id ?? '')
                        const name = String(c.name ?? '(unnamed)')
                        const type = String(c.type ?? '')
                        const isConfigured = id === smoobuChannels.configured
                        const isSuggested = smoobuChannels.suggested && Number(id) === smoobuChannels.suggested
                        return (
                          <button
                            key={id}
                            onClick={() => {
                              setEditedSettings(prev => ({ ...prev, booking_smoobu_channel_id: id }))
                              toast.success(`Channel ID ${id} ready — click Save to apply`)
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded text-left text-[11px] transition-colors ${isConfigured ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-black/30 border border-white/[0.04] hover:border-amber-500/30'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <code className="font-mono text-amber-300 font-semibold">{id}</code>
                              <span className="text-gray-300 truncate">{name}</span>
                              {type && <span className="text-gray-600 text-[10px] uppercase tracking-wider">{type}</span>}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {isConfigured && <span className="text-emerald-400 text-[10px] uppercase tracking-wider">Active</span>}
                              {!isConfigured && isSuggested && <span className="text-blue-400 text-[10px] uppercase tracking-wider">Suggested</span>}
                              {!isConfigured && <span className="text-gray-500 text-[10px]">Click to use</span>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* Sync health — surfaced for integrations that have a sync
                  pipeline (currently Smoobu). Last sync time + counts +
                  collapsible history mean staff can spot silent failures
                  instead of trusting the test connection alone. */}
              {section.id === 'smoobu' && hasAnyValue && isEnabled && syncStatus?.smoobu && (
                <div className="mt-3 mb-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-gray-400">
                        <Clock size={12} />
                        <span>Last sync:</span>
                        <span className="text-white font-semibold">
                          {syncStatus.smoobu.last_sync_relative ?? 'Never synced'}
                        </span>
                      </div>
                      {syncStatus.smoobu.last_synced_count != null && (
                        <span className="text-gray-500">
                          · <span className="text-emerald-400 font-semibold tabular-nums">{syncStatus.smoobu.last_synced_count}</span> synced
                          {syncStatus.smoobu.last_errors_count > 0 && (
                            <>, <span className="text-red-400 font-semibold tabular-nums">{syncStatus.smoobu.last_errors_count}</span> failed</>
                          )}
                        </span>
                      )}
                      <span className="text-gray-600">· <span className="tabular-nums">{syncStatus.smoobu.mirrored_count}</span> total mirrored</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowSyncHistory(prev => {
                          const next = new Set(prev)
                          next.has(section.id) ? next.delete(section.id) : next.add(section.id)
                          return next
                        })}
                        className="text-[11px] text-gray-500 hover:text-white">
                        {showSyncHistory.has(section.id) ? 'Hide history' : 'View history'}
                      </button>
                      <button onClick={async () => {
                          setSyncingNow(section.id)
                          try {
                            const { data: res } = await api.post('/v1/admin/bookings/sync')
                            toast.success(res.message || 'Sync complete')
                            refetchSync()
                            qc.invalidateQueries({ queryKey: ['bookings-engine'] })
                            qc.invalidateQueries({ queryKey: ['bookings-today'] })
                          } catch {
                            toast.error('Sync failed')
                          } finally { setSyncingNow(null) }
                        }}
                        disabled={syncingNow === section.id}
                        className={btnPrimary + ' bg-blue-500/15 text-blue-400 border border-blue-500/20 hover:bg-blue-500/25 disabled:opacity-40 text-xs'}>
                        {syncingNow === section.id
                          ? <><RefreshCw size={12} className="animate-spin" /> Syncing...</>
                          : <><RefreshCw size={12} /> Sync Now</>}
                      </button>
                    </div>
                  </div>
                  {showSyncHistory.has(section.id) && (
                    <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                      {syncStatus.smoobu.recent_history.length === 0 && (
                        <div className="text-[11px] text-gray-600 text-center py-2">No sync history yet.</div>
                      )}
                      {syncStatus.smoobu.recent_history.map((h: any) => (
                        <div key={h.id} className="flex items-start gap-2 text-[11px]">
                          <span className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.is_error ? 'bg-red-400' : 'bg-emerald-400'}`} />
                          <div className="flex-1 min-w-0">
                            <div className={h.is_error ? 'text-red-300' : 'text-gray-300'}>{h.description}</div>
                            <div className="text-gray-600">{h.relative} · {h.action}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {items.map((s: any) => renderSettingRow(s))}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-8">
        {/* API tokens panel — for external systems pushing leads in. */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1 mb-3">Developer API</h3>
          <ApiTokensPanel />
        </div>

        {/* Messaging Channels — OAuth-based integrations that don't fit
            the standard credential-input panel pattern. Each lives in its
            own self-contained component with its own connect/disconnect
            flow. Today: Facebook Messenger. Future: WhatsApp Cloud API,
            Instagram Messaging — same Settings section. */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1 mb-3">Messaging Channels</h3>
          <MessengerConnectPanel />
        </div>

        {allSections.map(group => {
          const rendered = group.sections.map(s => renderSection(s)).filter(Boolean)
          if (rendered.length === 0) return null
          return (
            <div key={group.label}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1 mb-3">{group.label}</h3>
              <div className="space-y-2">{rendered}</div>
            </div>
          )
        })}
      </div>
    )
  }

  /* ─── Tab: Booking ───────────────────────────────────────────────────── */

  const widgetToken = settingsData?.widget_token || ''

  const renderBooking = () => (
    <BookingTab
      getVal={getVal}
      handleChange={handleChange}
      widgetToken={widgetToken}
      cardClass={cardClass}
      cardStyle={cardStyle}
      inputClass={inputClass}
      btnPrimary={btnPrimary}
    />
  )

  // Booking implementation lives in components/settings/BookingTab.tsx — extracted
  // from this file to keep Settings.tsx focused on tab orchestration.


  const renderAiSystem = () => {
    const intSettings = groupSettings('integrations')
    const aiSections = [
      { id: 'openai',    title: 'OpenAI',    subtitle: 'GPT models for chatbot, insights & offers', icon: Brain, keys: ['ai_openai_api_key', 'ai_openai_model'], testType: 'openai' },
      { id: 'anthropic', title: 'Anthropic',  subtitle: 'Claude models for CRM AI assistant',        icon: Brain, keys: ['ai_anthropic_api_key', 'ai_anthropic_model'], testType: 'anthropic' },
    ]

    return (
      <div className="space-y-6">
        {/* AI Providers */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">AI Providers</h3>
          {aiSections.map(section => {
            const items = section.keys.map(k => intSettings.find((s: any) => s.key === k)).filter(Boolean)
            if (items.length === 0) return null
            const isOpen = expandedSections.has(section.id)
            const result = section.testType ? testResults[section.testType] : null
            const hasAnyValue = items.some((s: any) => s.has_value)

            return (
              <div key={section.id} className="rounded-2xl border border-white/[0.06] overflow-hidden" style={cardStyle}>
                <button onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-white/[0.02] transition-colors">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: hasAnyValue ? 'rgba(116,200,149,0.12)' : 'rgba(255,255,255,0.04)' }}>
                    <section.icon size={16} className={hasAnyValue ? 'text-emerald-400' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{section.title}</span>
                      {hasAnyValue && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">Active</span>}
                      {result && (
                        <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${result.success ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                          {result.success ? <CheckCircle size={8} /> : <XCircle size={8} />} {result.message}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">{section.subtitle}</p>
                  </div>
                  <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 border-t border-white/[0.04]">
                    <div className="flex justify-end pt-4 pb-2">
                      <button onClick={() => testConnection(section.testType)}
                        disabled={testingIntegration === section.testType}
                        className={btnPrimary + ' bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 disabled:opacity-40'}>
                        {testingIntegration === section.testType ? <><RefreshCw size={13} className="animate-spin" /> Testing...</> : <><Wifi size={13} /> Test Connection</>}
                      </button>
                    </div>
                    {items.map((s: any) => renderSettingRow(s))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* System Info */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Shield size={15} className="text-emerald-400" /> System Information
          </h3>
          <dl className="space-y-0">
            {[
              { label: 'API URL', value: import.meta.env.VITE_API_URL ?? 'localhost' },
              { label: 'App Version', value: 'v1.0.0' },
              { label: 'Stack', value: 'Laravel + React + Expo' },
              { label: 'AI Provider', value: getVal('ai_openai_model') || getVal('ai_anthropic_model') || 'Not configured' },
            ].map((item, i) => (
              <div key={i} className="flex justify-between py-3 border-b border-white/[0.04] last:border-0">
                <dt className="text-sm text-gray-500">{item.label}</dt>
                <dd className="text-sm font-medium text-white">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Quick Links */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <ExternalLink size={15} className="text-emerald-400" /> Quick Links
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'OpenAI Platform', icon: <Brain size={16} />, desc: 'API usage & billing', url: 'https://platform.openai.com/' },
              { label: 'Anthropic Console', icon: <Brain size={16} />, desc: 'Claude API dashboard', url: 'https://console.anthropic.com/' },
              { label: 'Expo Dashboard', icon: <Smartphone size={16} />, desc: 'Mobile builds', url: 'https://expo.dev/' },
              { label: 'Laravel Cloud', icon: <Cloud size={16} />, desc: 'Deployment & logs', url: 'https://cloud.laravel.com/' },
              { label: 'DigitalOcean', icon: <Database size={16} />, desc: 'Server management', url: 'https://cloud.digitalocean.com/' },
            ].map(link => (
              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                className="flex items-start gap-3 p-3 rounded-xl border border-white/[0.04] hover:border-emerald-500/20 transition-all hover:-translate-y-px group"
                style={{ background: 'rgba(15,28,24,0.5)' }}>
                <div className="text-emerald-400 mt-0.5">{link.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                    {link.label} <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </p>
                  <p className="text-[11px] text-gray-600">{link.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* ─── Render Active Tab ──────────────────────────────────────────────── */

  const renderTabContent = () => {
    if (settingsLoading) {
      return (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className={cardClass + ' animate-pulse'} style={cardStyle}>
              <div className="h-5 bg-white/[0.04] rounded w-32 mb-4" />
              <div className="space-y-3">
                <div className="h-10 bg-white/[0.04] rounded-xl" />
                <div className="h-10 bg-white/[0.04] rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )
    }

    switch (activeTab) {
      case 'general': return renderGeneral()
      case 'branding': return renderBranding()
      case 'loyalty': return renderLoyalty()
      case 'integrations': return renderIntegrations()
      case 'booking': return renderBooking()
      case 'pipelines': return <PipelinesAdmin />
      case 'planner': return <PlannerSettings />
      case 'menu': return <MenuSettings />
      case 'industry': return <IndustrySwitcherPanel />
      case 'team': return <TeamSettings />
      case 'mobile_app': return renderMobileApp()
      case 'documentation': return <DocumentationCenter />
      case 'ai_usage': return <AiUsagePanel />
      case 'ai_system': return renderAiSystem()
      default: {
        // Generic tab — just render its settings
        return (
          <div className="space-y-6">
            {tabSettings.length === 0 ? (
              <div className={cardClass} style={cardStyle}>
                <p className="text-sm text-gray-600 py-8 text-center">No settings in this section yet.</p>
              </div>
            ) : (
              <div className={cardClass} style={cardStyle}>
                {tabSettings.map(renderSettingRow)}
              </div>
            )}
          </div>
        )
      }
    }
  }

  /* ─── Main Layout ────────────────────────────────────────────────────── */

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('settings.title', 'Settings')}</h1>
          <p className="text-sm text-t-secondary mt-0.5">{t('settings.subtitle', 'Manage your platform configuration, integrations, and branding')}</p>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-2">
            <button onClick={() => setEditedSettings({})}
              className={btnPrimary + ' bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:bg-white/[0.08]'}>
              <RotateCcw size={14} /> {t('settings.discard', 'Discard')}
            </button>
            <button onClick={handleSave} disabled={saveMutation.isPending}
              className={btnPrimary + ' text-white border border-emerald-500/30 hover:border-emerald-500/50'}
              style={{ background: 'linear-gradient(135deg, rgba(116,200,149,0.25), rgba(116,200,149,0.1))' }}>
              {saveMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {t('settings.save_changes', 'Save changes')}
            </button>
          </div>
        )}
      </div>

      {/* Settings home grid OR breadcrumb + content.
          Home (default) = sectioned grid of cards. Click a card → deep-link
          via ?tab=<id> into that section. Breadcrumb shows up on every
          non-home tab to jump back to the index. */}
      {(() => {
        // Resolve current tab metadata once. tab === undefined when
        // activeTab === 'home' OR the URL carries a stale ?tab= the
        // user can no longer access (gated away). In the latter case
        // we fall through to the home grid so the page never blanks.
        const tabIsVisible = (t: Tab) => {
          if (t.superAdminOnly && !isSuperAdmin) return false
          if (t.feature && !hasFeature(t.feature)) return false
          if (t.product && !hasProduct(t.product)) return false
          // Phase 4 — industry hides. Falls through to home grid when a
          // stale `?tab=` URL points at a now-hidden tab (line below at
          // `onHome = ... || !tabIsVisible(tab)`), so no blanks.
          if (industryHiddenTabs.includes(t.id)) return false
          return true
        }
        const tab = TABS.find(t => t.id === activeTab)
        const onHome = activeTab === 'home' || !tab || !tabIsVisible(tab)

        if (onHome) {
          // Flat home grid (2026-05-30): every visible tab renders as a
          // square tile at the same visual level. SECTIONS no longer
          // drives layout — each tile pulls its accent from
          // TAB_ACCENTS and stands on its own.
          const visibleTabs = TABS.filter(tabIsVisible)

          const tint = (hex: string, alpha: number) => {
            const h = hex.replace('#', '')
            const r = parseInt(h.slice(0, 2), 16)
            const g = parseInt(h.slice(2, 4), 16)
            const b = parseInt(h.slice(4, 6), 16)
            return `rgba(${r},${g},${b},${alpha})`
          }

          const q = homeSearch.trim().toLowerCase()
          // Phase 3 — search ALSO matches the industry-relabelled name,
          // so a beauty admin searching "business" finds the Hotel Info
          // tab (relabelled to "Business Info"). Canonical English
          // "hotel" still matches too, so muscle memory keeps working.
          const filteredTabs = !q ? visibleTabs : visibleTabs.filter(tile => {
            const canonical = t(`settings.tabs.${tile.id}`, tile.label).toLowerCase()
            const industry = (vocab(tile.label) ?? '').toLowerCase()
            const desc = t(`settings.descs.${tile.id}`, tile.desc).toLowerCase()
            return canonical.includes(q) || industry.includes(q) || desc.includes(q)
          })

          return (
            <div className="space-y-5">
              <div className="relative max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
                <input
                  value={homeSearch}
                  onChange={(e) => setHomeSearch(e.target.value)}
                  placeholder={t('settings.home_search', 'Search settings…')}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-primary-500 transition-colors"
                />
              </div>

              {filteredTabs.length === 0 && (
                <div className="text-center py-12 text-t-secondary text-sm">
                  {t('settings.home_no_match', 'No settings match that search.')}
                </div>
              )}

              {/* Flat square-tile grid. With up to 14 tabs visible the
                  grid lays out as 5-wide at xl, 4 at md/lg, 3 at sm, 2
                  on mobile. Capped width keeps tiles a comfortable size
                  on ultrawides. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 max-w-[1400px]">
                {filteredTabs.map(tile => {
                  const TIcon = tile.icon
                  const accent = TAB_ACCENTS[tile.id] ?? '#9ca3af'
                  return (
                    <button
                      key={tile.id}
                      onClick={() => setActiveTab(tile.id)}
                      className="group relative aspect-square flex flex-col bg-dark-surface border border-dark-border rounded-2xl p-4 sm:p-5 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 text-left"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = accent
                        e.currentTarget.style.boxShadow = `0 12px 36px ${tint(accent, 0.22)}`
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = ''
                        e.currentTarget.style.boxShadow = ''
                      }}
                    >
                      <span
                        aria-hidden
                        className="absolute -right-12 -top-12 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-3xl pointer-events-none"
                        style={{ background: tint(accent, 0.30) }}
                      />
                      <span
                        aria-hidden
                        className="absolute inset-x-0 top-0 h-px"
                        style={{ background: `linear-gradient(90deg, transparent, ${tint(accent, 0.45)}, transparent)` }}
                      />

                      <div className="relative">
                        <span
                          className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-2xl items-center justify-center transition-transform group-hover:scale-105"
                          style={{
                            background: `linear-gradient(135deg, ${tint(accent, 0.22)}, ${tint(accent, 0.06)})`,
                            border: `1px solid ${tint(accent, 0.35)}`,
                            boxShadow: `0 0 24px ${tint(accent, 0.20)}`,
                          }}
                        >
                          <TIcon size={20} style={{ color: accent }} />
                        </span>
                      </div>

                      <div className="relative mt-auto">
                        <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                          {vocab(tile.label) ?? t(`settings.tabs.${tile.id}`, tile.label)}
                        </h3>
                        <p className="text-xs text-t-secondary mt-1 line-clamp-2 leading-relaxed">
                          {t(`settings.descs.${tile.id}`, tile.desc)}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        }

        // Non-home: slim breadcrumb + content. Breadcrumb tail
        // (description) dropped 2026-05-30 to match the other hubs.
        const TIcon = tab.icon
        // Industry Platform Plan Phase 3 — vocabulary override flexes
        // tab labels per industry ("Hotel Info" → "Business Info" for
        // beauty, "Practice Info" for medical, "Venue Info" for
        // restaurant). The tab `id` ('general') stays canonical so
        // `?tab=general` deep-links keep working on every industry.
        const label = vocab(tab.label) ?? t(`settings.tabs.${tab.id}`, tab.label)
        return (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setActiveTab('home')}
                  className="flex items-center gap-1 text-xs text-t-secondary hover:text-white transition-colors px-1.5 py-1 -ml-1.5 rounded-md hover:bg-dark-surface2 flex-shrink-0"
                  title={t('settings.back_to_home', 'All settings')}
                >
                  <ArrowLeft size={13} />
                  <span className="hidden sm:inline">{t('settings.title', 'Settings')}</span>
                </button>
                <span className="text-t-secondary/40 flex-shrink-0">/</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <TIcon size={14} className="text-t-secondary flex-shrink-0" />
                  <h2 className="text-base font-semibold text-white truncate">{label}</h2>
                </div>
              </div>
            </div>
            {renderTabContent()}
          </div>
        )
      })()}
    </div>
  )
}
