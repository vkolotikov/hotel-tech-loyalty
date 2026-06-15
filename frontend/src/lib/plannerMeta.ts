/**
 * Shared icon + color metadata for the Planner's task groups and
 * channels. Single source of truth for:
 *
 *   • TASK_GROUP_META  — built-in group → { icon, color } map. Used
 *     as the fallback when the admin hasn't overridden a group with
 *     a custom icon/color in Settings → Planner.
 *
 *   • CUSTOM_GROUP_META — default fallback for any group name that
 *     isn't in the built-in map AND hasn't been customised.
 *
 *   • DEFAULT_CHANNELS — the 6 starter communication channels
 *     (Call / Email / WhatsApp / SMS / Video / In-person). Admins can
 *     replace or extend these via crm_settings.planner_channels.
 *
 *   • ICON_OPTIONS — the curated picker list of selectable lucide
 *     icons. Keep it small (~30 icons) so the picker stays scannable.
 *     Each entry has a stable string key (persisted in settings) +
 *     the React component (for rendering).
 *
 *   • COLOR_OPTIONS — the curated picker list of accent colors.
 *
 * Storage shapes (in crm_settings JSON):
 *   • planner_groups: string[] (legacy) or Array<{ name, icon?, color? }>
 *   • planner_channels: Array<{ key, label, icon, color }>
 *
 * The hooks below normalise both legacy + enriched shapes so
 * consumers never have to deal with the variation.
 */

import { useQuery } from '@tanstack/react-query'
import {
  // Built-in group icons
  BedDouble, ConciergeBell, Wrench, Coffee, Briefcase, Phone, PartyPopper, Sparkles,
  // Channel defaults
  Mail, MessageCircle, MessageSquare, Video, User,
  // Extra icons available in the picker
  Calendar, Clock, Star, Heart, Flag, Bell, Bookmark, Building2,
  Truck, Package, ShoppingCart, CreditCard, FileText, ClipboardList,
  CheckCircle2, AlertCircle, Megaphone, Target, Zap, Smile,
  Camera, Music, Palette, Code, Globe, Stethoscope, GraduationCap,
  Dumbbell, Scissors, Utensils, Home, Car, Plane, Gift,
} from 'lucide-react'
import { api } from './api'

/* ─────────────────────────  Icon picker  ───────────────────────── */

/**
 * Curated icon catalogue. The string key is what gets persisted to
 * crm_settings; the component is the render target. Order is the
 * order in which icons appear in the picker UI.
 */
export const ICON_OPTIONS: Record<string, any> = {
  sparkles:        Sparkles,
  'bed-double':    BedDouble,
  'concierge-bell':ConciergeBell,
  wrench:          Wrench,
  coffee:          Coffee,
  briefcase:       Briefcase,
  phone:           Phone,
  mail:            Mail,
  'message-circle':MessageCircle,
  'message-square':MessageSquare,
  video:           Video,
  user:            User,
  calendar:        Calendar,
  clock:           Clock,
  star:            Star,
  heart:           Heart,
  flag:            Flag,
  bell:            Bell,
  bookmark:        Bookmark,
  'party-popper':  PartyPopper,
  'building-2':    Building2,
  truck:           Truck,
  package:         Package,
  'shopping-cart': ShoppingCart,
  'credit-card':   CreditCard,
  'file-text':     FileText,
  'clipboard-list':ClipboardList,
  'check-circle':  CheckCircle2,
  'alert-circle':  AlertCircle,
  megaphone:       Megaphone,
  target:          Target,
  zap:             Zap,
  smile:           Smile,
  camera:          Camera,
  music:           Music,
  palette:         Palette,
  code:            Code,
  globe:           Globe,
  stethoscope:     Stethoscope,
  'graduation-cap':GraduationCap,
  dumbbell:        Dumbbell,
  scissors:        Scissors,
  utensils:        Utensils,
  home:            Home,
  car:             Car,
  plane:           Plane,
  gift:            Gift,
}

/** Lookup with default fallback to Sparkles for unknown keys. */
export function getIcon(key?: string | null): any {
  if (!key) return Sparkles
  return ICON_OPTIONS[key] ?? Sparkles
}

/**
 * Curated accent colour palette. Hex strings so we can compose alpha
 * suffixes (`color + '38'`) for the chip backgrounds.
 */
export const COLOR_OPTIONS: string[] = [
  '#10b981', // emerald — Housekeeping
  '#3b82f6', // blue    — Front Office
  '#f59e0b', // amber   — Maintenance
  '#a855f7', // violet  — F&B
  '#ef4444', // red     — Management
  '#06b6d4', // cyan    — Sales
  '#ec4899', // pink    — Events
  '#fbbf24', // gold    — in-person
  '#22d3ee', // sky     — call
  '#a78bfa', // purple  — email
  '#25D366', // green   — WhatsApp
  '#8b5cf6', // indigo  — SMS
  '#fb923c', // orange  — Production
  '#34d399', // teal    — Delivery
  '#94a3b8', // slate   — Custom
]

/* ─────────────────────────  Group meta  ───────────────────────── */

export interface GroupMeta { icon: any; color: string; iconKey?: string }
export interface ChannelDef { key: string; label: string; icon: string; color: string; groups: string[] }

/**
 * Built-in group → meta map. Falls through for anything an admin
 * names that doesn't match these keys (Custom fallback used then).
 */
export const TASK_GROUP_META: Record<string, GroupMeta> = {
  Housekeeping:   { icon: BedDouble,     color: '#10b981', iconKey: 'bed-double' },
  'Front Desk':   { icon: ConciergeBell, color: '#3b82f6', iconKey: 'concierge-bell' },
  'Front Office': { icon: ConciergeBell, color: '#3b82f6', iconKey: 'concierge-bell' },
  Maintenance:    { icon: Wrench,        color: '#f59e0b', iconKey: 'wrench' },
  'F&B':          { icon: Coffee,        color: '#a855f7', iconKey: 'coffee' },
  Management:     { icon: Briefcase,     color: '#ef4444', iconKey: 'briefcase' },
  Sales:          { icon: Phone,         color: '#06b6d4', iconKey: 'phone' },
  Events:         { icon: PartyPopper,   color: '#ec4899', iconKey: 'party-popper' },
}

export const CUSTOM_GROUP_META: GroupMeta = {
  icon: Sparkles, color: '#94a3b8', iconKey: 'sparkles',
}

/**
 * Normalise the raw `planner_groups` setting value into both a
 * string-name array (back-compat for existing callers) AND a
 * customisation map keyed by group name. Legacy entries (plain
 * strings) leave the customisation map empty for that group, so it
 * falls through to TASK_GROUP_META / CUSTOM_GROUP_META.
 */
export function parsePlannerGroups(raw: any): {
  names: string[]
  custom: Record<string, GroupMeta>
} {
  let parsed: any = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { parsed = null }
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    parsed = Object.values(parsed)
  }
  if (!Array.isArray(parsed)) return { names: [], custom: {} }

  const names: string[] = []
  const custom: Record<string, GroupMeta> = {}
  for (const entry of parsed) {
    if (typeof entry === 'string') {
      names.push(entry)
      continue
    }
    if (entry && typeof entry === 'object' && entry.name) {
      const name = String(entry.name)
      names.push(name)
      if (entry.icon || entry.color) {
        custom[name] = {
          icon: getIcon(entry.icon ?? null),
          color: entry.color || (TASK_GROUP_META[name]?.color ?? CUSTOM_GROUP_META.color),
          iconKey: entry.icon ?? TASK_GROUP_META[name]?.iconKey ?? CUSTOM_GROUP_META.iconKey,
        }
      }
    }
  }
  return { names, custom }
}

/**
 * Resolve a group name to its meta, honouring (in priority order):
 *   1. the admin-customised override from settings
 *   2. the built-in TASK_GROUP_META
 *   3. the Custom fallback (sparkles)
 */
export function resolveGroupMeta(
  group: string | null | undefined,
  custom: Record<string, GroupMeta>,
): GroupMeta {
  if (!group) return CUSTOM_GROUP_META
  return custom[group] ?? TASK_GROUP_META[group] ?? CUSTOM_GROUP_META
}

/* ─────────────────────────  Channels  ───────────────────────── */

/** Starter set — what every org sees until they customise. */
export const DEFAULT_CHANNELS: ChannelDef[] = [
  { key: 'call',      label: 'Call',      icon: 'phone',           color: '#22d3ee', groups: [] },
  { key: 'email',     label: 'Email',     icon: 'mail',            color: '#a78bfa', groups: [] },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: 'message-circle',  color: '#25D366', groups: [] },
  { key: 'sms',       label: 'SMS',       icon: 'message-square',  color: '#8b5cf6', groups: [] },
  { key: 'video',     label: 'Video',     icon: 'video',           color: '#06b6d4', groups: [] },
  { key: 'in_person', label: 'In-person', icon: 'user',            color: '#fbbf24', groups: [] },
]

/**
 * Normalise the raw `planner_channels` setting value into the planner's
 * "Tasks" list. Returns [] when empty / malformed (the org defines its own
 * group-specific tasks — we no longer auto-inject the comm-channel defaults).
 * Each task carries `groups`: the group names it belongs to; an empty array
 * means "universal" (shows under every group in the New-task drawer).
 */
export function parsePlannerChannels(raw: any): ChannelDef[] {
  let parsed: any = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { parsed = null }
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    parsed = Object.values(parsed)
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return []

  const out: ChannelDef[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const key = String(entry.key || '').trim()
    const label = String(entry.label || '').trim()
    if (!key || !label) continue
    out.push({
      key,
      label,
      icon: entry.icon ?? 'phone',
      color: entry.color ?? '#94a3b8',
      // Groups this task belongs to. Empty = universal (shows everywhere).
      groups: Array.isArray(entry.groups) ? entry.groups.map((g: any) => String(g)) : [],
    })
  }
  return out
}

/* ─────────────────────────  Hooks  ───────────────────────── */

/**
 * Shared hook that pulls the raw crm-settings query (already cached
 * across the SPA) and returns parsed groups + channels. Components
 * can call this from anywhere without triggering an extra fetch.
 */
export function usePlannerMeta(): {
  groupNames: string[]
  customGroupMeta: Record<string, GroupMeta>
  channels: ChannelDef[]
} {
  const { data } = useQuery<Record<string, any>>({
    queryKey: ['crm-settings'],
    queryFn: () => api.get('/v1/admin/crm-settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const { names, custom } = parsePlannerGroups(data?.planner_groups)
  const channels = parsePlannerChannels(data?.planner_channels)
  return { groupNames: names, customGroupMeta: custom, channels }
}
