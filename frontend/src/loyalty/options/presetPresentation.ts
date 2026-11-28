import { Briefcase, Building2, Dumbbell, GraduationCap, House, ShoppingBag, Sparkles, Star, Stethoscope, Ticket, Users, Utensils, type LucideIcon } from 'lucide-react'
import type { Hue } from '../ui/sections'
import { named } from '../lib/forms'
import type { Say } from './optionsMath'
import type { Preset } from './types'
import { PRESET_LINE_WORDS, PRESET_WORDS } from './words'

/** Visual cues follow the icon supplied by the server, rather than duplicating its industry catalogue. */
export const PRESET_ICONS: Record<string, LucideIcon> = {
  'building-2': Building2, sparkles: Sparkles, utensils: Utensils, dumbbell: Dumbbell, stethoscope: Stethoscope, star: Star,
  'graduation-cap': GraduationCap, briefcase: Briefcase, home: House, 'shopping-bag': ShoppingBag, users: Users, ticket: Ticket,
}
const HUES: Record<string, Hue> = { 'building-2': 'tier', sparkles: 'bonus', utensils: 'gift', dumbbell: 'earn', stethoscope: 'place', star: 'gift', 'graduation-cap': 'bonus', briefcase: 'tier', home: 'place', 'shopping-bag': 'offer', users: 'tier', ticket: 'offer' }
export const presetHue = (icon: string): Hue => HUES[icon] ?? 'bonus'
export function presetName(say: Say, preset: Preset): string {
  const word = named('loyalty.options.preset', PRESET_WORDS, preset.key)
  return word ? say(...word) : preset.label
}
export function presetLine(say: Say, preset: Preset): string {
  const word = named('loyalty.options.preset_line', PRESET_LINE_WORDS, preset.key)
  return word ? say(...word) : preset.description
}
