import { describe, expect, it } from 'vitest'
import {
  COLOR_OPTIONS,
  CUSTOM_GROUP_META,
  DEFAULT_CHANNELS,
  ICON_OPTIONS,
  TASK_GROUP_META,
  getIcon,
  parsePlannerChannels,
  parsePlannerGroups,
  resolveGroupMeta,
} from './plannerMeta'

/**
 * Locks the planner meta parsing + lookup contracts. Two shapes
 * MUST round-trip cleanly because they're the storage format of
 * `crm_settings.planner_groups` and `planner_channels`:
 *
 *   Legacy planner_groups = string[]
 *   Enriched planner_groups = Array<{ name, icon?, color? }>
 *   planner_channels = Array<{ key, label, icon, color }>
 *
 * Parsing helpers (parsePlannerGroups, parsePlannerChannels) normalise
 * both shapes and fall back gracefully. resolveGroupMeta picks the
 * right meta from a 3-tier chain: admin override → built-in →
 * Custom fallback (sparkles). getIcon looks up by string key with a
 * Sparkles fallback for unknown keys.
 */
describe('plannerMeta — picker tables', () => {
  it('ICON_OPTIONS exposes at least 30 selectable icons (curated picker size)', () => {
    expect(Object.keys(ICON_OPTIONS).length).toBeGreaterThanOrEqual(30)
  })

  it('COLOR_OPTIONS exposes a non-empty curated palette of hex strings', () => {
    expect(COLOR_OPTIONS.length).toBeGreaterThan(0)
    for (const c of COLOR_OPTIONS) {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('TASK_GROUP_META covers the 7 canonical built-in groups', () => {
    const builtIn = ['Housekeeping', 'Front Desk', 'Front Office', 'Maintenance', 'F&B', 'Management', 'Sales', 'Events']
    for (const g of builtIn) {
      expect(TASK_GROUP_META[g]).toBeTruthy()
      expect(TASK_GROUP_META[g].icon).toBeTruthy()
      expect(TASK_GROUP_META[g].color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})

describe('plannerMeta — getIcon', () => {
  it('returns the matching component for a known key', () => {
    expect(getIcon('sparkles')).toBe(ICON_OPTIONS.sparkles)
    expect(getIcon('phone')).toBe(ICON_OPTIONS.phone)
  })

  it('falls back to Sparkles for unknown keys', () => {
    const fallback = getIcon('this-icon-does-not-exist')
    expect(fallback).toBe(ICON_OPTIONS.sparkles)
  })

  it('falls back to Sparkles for null + undefined + empty', () => {
    expect(getIcon(null)).toBe(ICON_OPTIONS.sparkles)
    expect(getIcon(undefined)).toBe(ICON_OPTIONS.sparkles)
    expect(getIcon('')).toBe(ICON_OPTIONS.sparkles)
  })
})

describe('plannerMeta — parsePlannerGroups', () => {
  it('returns empty names + custom on null/undefined/empty input', () => {
    expect(parsePlannerGroups(null)).toEqual({ names: [], custom: {} })
    expect(parsePlannerGroups(undefined)).toEqual({ names: [], custom: {} })
    expect(parsePlannerGroups([])).toEqual({ names: [], custom: {} })
  })

  it('parses a legacy string-array (oldest storage shape)', () => {
    // Legacy: planner_groups was just string[]. Custom map stays
    // empty so the consumer falls through to TASK_GROUP_META.
    const out = parsePlannerGroups(['Housekeeping', 'Maintenance', 'Custom Group'])

    expect(out.names).toEqual(['Housekeeping', 'Maintenance', 'Custom Group'])
    expect(out.custom).toEqual({})
  })

  it('parses an enriched array of {name, icon, color} objects', () => {
    // Enriched: admin customised icon + color per group.
    const out = parsePlannerGroups([
      { name: 'Inspections', icon: 'wrench', color: '#10b981' },
      { name: 'Reviews',     icon: 'star',   color: '#ef4444' },
    ])

    expect(out.names).toEqual(['Inspections', 'Reviews'])
    expect(out.custom.Inspections.color).toBe('#10b981')
    expect(out.custom.Inspections.iconKey).toBe('wrench')
    expect(out.custom.Reviews.color).toBe('#ef4444')
  })

  it('handles mixed legacy strings AND enriched objects in the same array', () => {
    // Transitional shape after a partial admin save.
    const out = parsePlannerGroups([
      'Housekeeping',
      { name: 'Custom Inspections', icon: 'wrench', color: '#f59e0b' },
    ])

    expect(out.names).toEqual(['Housekeeping', 'Custom Inspections'])
    expect(out.custom.Housekeeping).toBeUndefined()
    expect(out.custom['Custom Inspections']).toBeDefined()
  })

  it('parses a JSON string (server may double-encode)', () => {
    // Some endpoints serialise the array as a JSON string in the
    // settings response. Helper must decode transparently.
    const out = parsePlannerGroups('["Housekeeping","Maintenance"]')
    expect(out.names).toEqual(['Housekeeping', 'Maintenance'])
  })

  it('handles a malformed JSON string by returning empty', () => {
    const out = parsePlannerGroups('{not valid json}')
    expect(out).toEqual({ names: [], custom: {} })
  })

  it('skips entries without a name field', () => {
    const out = parsePlannerGroups([
      { name: 'Real Group' },
      { icon: 'wrench' }, // no name → skip
      { name: '', color: '#000000' }, // empty name → skip (falsy)
    ])

    expect(out.names).toEqual(['Real Group'])
  })

  it('inherits TASK_GROUP_META color when only icon is customised', () => {
    // Partial customisation: admin set only the icon, color falls
    // back to the built-in meta for known group names.
    const out = parsePlannerGroups([
      { name: 'Housekeeping', icon: 'wrench' },
    ])
    expect(out.custom.Housekeeping?.color).toBe(TASK_GROUP_META.Housekeeping.color)
  })
})

describe('plannerMeta — resolveGroupMeta', () => {
  it('returns CUSTOM_GROUP_META for null/undefined group name', () => {
    expect(resolveGroupMeta(null, {})).toBe(CUSTOM_GROUP_META)
    expect(resolveGroupMeta(undefined, {})).toBe(CUSTOM_GROUP_META)
  })

  it('returns admin custom override when present (highest priority)', () => {
    const adminMeta = { icon: ICON_OPTIONS.flag, color: '#ff00ff', iconKey: 'flag' }
    const out = resolveGroupMeta('Housekeeping', { Housekeeping: adminMeta })
    expect(out).toBe(adminMeta)
  })

  it('falls through to TASK_GROUP_META when no admin override', () => {
    const out = resolveGroupMeta('Housekeeping', {})
    expect(out).toBe(TASK_GROUP_META.Housekeeping)
  })

  it('falls through to CUSTOM_GROUP_META for unknown group name', () => {
    const out = resolveGroupMeta('Drone Inspections', {})
    expect(out).toBe(CUSTOM_GROUP_META)
  })

  it('admin override beats built-in even when both exist', () => {
    // Confirms the 3-tier priority order: admin > built-in > fallback.
    const adminMeta = { icon: ICON_OPTIONS.star, color: '#000000', iconKey: 'star' }
    const out = resolveGroupMeta('Housekeeping', { Housekeeping: adminMeta })
    expect(out).toBe(adminMeta)
    expect(out).not.toBe(TASK_GROUP_META.Housekeeping)
  })
})

describe('plannerMeta — parsePlannerChannels', () => {
  it('returns DEFAULT_CHANNELS on null/undefined/empty', () => {
    expect(parsePlannerChannels(null)).toBe(DEFAULT_CHANNELS)
    expect(parsePlannerChannels(undefined)).toBe(DEFAULT_CHANNELS)
    expect(parsePlannerChannels([])).toBe(DEFAULT_CHANNELS)
  })

  it('parses admin-customised channel list', () => {
    const out = parsePlannerChannels([
      { key: 'slack',    label: 'Slack',    icon: 'message-circle', color: '#ff00ff' },
      { key: 'telegram', label: 'Telegram', icon: 'message-square', color: '#0088cc' },
    ])

    expect(out).toHaveLength(2)
    expect(out[0].key).toBe('slack')
    expect(out[0].color).toBe('#ff00ff')
  })

  it('falls back to DEFAULT_CHANNELS when all entries are invalid', () => {
    // Empty + entries without key/label all get dropped. If the
    // result list is empty, we fall back to DEFAULT_CHANNELS so the
    // picker always has SOMETHING to render.
    const out = parsePlannerChannels([
      { icon: 'phone' },            // no key + no label
      { key: '', label: 'Empty' },  // empty key
      { key: 'k', label: '' },      // empty label
    ])

    expect(out).toBe(DEFAULT_CHANNELS)
  })

  it('skips invalid entries while preserving valid ones', () => {
    const out = parsePlannerChannels([
      { key: 'slack', label: 'Slack', icon: 'message-circle', color: '#000' },
      null,                                // dropped
      'not-an-object',                     // dropped
      { key: 'real', label: 'Real Channel' },
    ])

    expect(out).toHaveLength(2)
    expect(out.map(c => c.key)).toEqual(['slack', 'real'])
  })

  it('defaults icon to "phone" and color to slate when unspecified on a valid entry', () => {
    const out = parsePlannerChannels([
      { key: 'custom', label: 'Custom Channel' },
    ])

    expect(out[0].icon).toBe('phone')
    expect(out[0].color).toBe('#94a3b8')
  })

  it('parses JSON-encoded string transparently', () => {
    const json = JSON.stringify([
      { key: 'fax', label: 'Fax', icon: 'phone', color: '#000' },
    ])
    const out = parsePlannerChannels(json)

    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('fax')
  })

  it('handles malformed JSON by returning DEFAULT_CHANNELS', () => {
    const out = parsePlannerChannels('{garbage')
    expect(out).toBe(DEFAULT_CHANNELS)
  })
})

describe('plannerMeta — DEFAULT_CHANNELS', () => {
  it('exposes the 6 starter channels (call/email/whatsapp/sms/video/in_person)', () => {
    const keys = DEFAULT_CHANNELS.map(c => c.key).sort()
    expect(keys).toEqual(['call', 'email', 'in_person', 'sms', 'video', 'whatsapp'])
  })

  it('every default channel has stable key + label + icon + color', () => {
    for (const c of DEFAULT_CHANNELS) {
      expect(c.key.length).toBeGreaterThan(0)
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.icon.length).toBeGreaterThan(0)
      expect(c.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})
