import { describe, expect, it } from 'vitest'
import {
  DEAL_LIST_FIELD_META,
  DEFAULT_CORPORATE_FIELDS,
  DEFAULT_CUSTOMER_FIELDS,
  DEFAULT_DEAL_FIELDS,
  DEFAULT_INQUIRY_FIELDS,
  DEFAULT_MEMBER_FIELDS,
  DEFAULT_TASK_FIELDS,
  INQUIRY_LIST_FIELD_META,
} from './crmSettings'

/**
 * Locks the DEFAULT_* field-visibility constants that power the
 * Field Manager (89 toggles across 6 entities per CLAUDE.md).
 *
 * Why this matters: useSettings() deep-merges these with the
 * server's saved partial config. The contract is "adding a new
 * toggleable field in code doesn't break orgs that saved a partial
 * config before the field existed". That contract holds as long as
 * the defaults define EVERY toggle key. A missing entry on a
 * default would render that key as `undefined` on legacy orgs —
 * silently turning the toggle into an inverse "off" state.
 *
 * useSettings() itself is a React Query hook that can't be tested
 * without the jsdom + RTL layer. The constants it folds in are
 * the load-bearing pieces though — locking them catches drift
 * before the merge runs.
 *
 * What we lock:
 *   - DEFAULT_INQUIRY_FIELDS has form + list + detail sub-objects
 *   - Every other DEFAULT_* shape matches its TypeScript interface
 *   - All values are booleans (no stringly-typed feature flags)
 *   - INQUIRY_LIST_FIELD_META and DEAL_LIST_FIELD_META cover every
 *     list-field key from their respective default config (drift
 *     guard for the picker UI)
 */
describe('crmSettings DEFAULT_* constants', () => {
  it('DEFAULT_INQUIRY_FIELDS has form + list + detail sub-objects', () => {
    expect(DEFAULT_INQUIRY_FIELDS).toHaveProperty('form')
    expect(DEFAULT_INQUIRY_FIELDS).toHaveProperty('list')
    expect(DEFAULT_INQUIRY_FIELDS).toHaveProperty('detail')
  })

  it('DEFAULT_INQUIRY_FIELDS — every value is a boolean', () => {
    // Locks the no-stringly-typed-feature-flags rule for inquiries.
    // A regression that introduces a string value would surface as
    // truthy garbage in the form rendering logic.
    for (const section of ['form', 'list', 'detail'] as const) {
      for (const [key, val] of Object.entries(DEFAULT_INQUIRY_FIELDS[section])) {
        expect(typeof val).toBe('boolean')
        expect(typeof key).toBe('string')
      }
    }
  })

  it('DEFAULT_INQUIRY_FIELDS — bulk_select defaults OFF (admin opts in)', () => {
    // Locks a documented UX choice. bulk_select adds a checkbox
    // column that makes the leads list busier — admins opt in
    // explicitly via the Field Manager when they need it.
    expect(DEFAULT_INQUIRY_FIELDS.list.bulk_select).toBe(false)
  })

  it('DEFAULT_INQUIRY_FIELDS — ai_signal defaults ON (revenue-relevant)', () => {
    // The AI win-probability cell defaults ON because the v2 row
    // renders blank when there's no AI run yet — no churn for legacy
    // data + the orgs that ARE running AI see the signal immediately.
    expect(DEFAULT_INQUIRY_FIELDS.list.ai_signal).toBe(true)
  })

  it('DEFAULT_CUSTOMER_FIELDS has form + list + detail sub-objects', () => {
    expect(DEFAULT_CUSTOMER_FIELDS).toHaveProperty('form')
    expect(DEFAULT_CUSTOMER_FIELDS).toHaveProperty('list')
    expect(DEFAULT_CUSTOMER_FIELDS).toHaveProperty('detail')
  })

  it('DEFAULT_CUSTOMER_FIELDS — country defaults OFF in list (niche)', () => {
    expect(DEFAULT_CUSTOMER_FIELDS.list.country).toBe(false)
  })

  it('DEFAULT_CUSTOMER_FIELDS — first_last_names defaults OFF in form', () => {
    // The default uses the single full_name field — first/last
    // split is opt-in.
    expect(DEFAULT_CUSTOMER_FIELDS.form.first_last_names).toBe(false)
  })

  it('DEFAULT_CORPORATE_FIELDS has list + detail (no form)', () => {
    // CorporateFieldConfig is list-only + detail-only because
    // companies use a dedicated drawer, not a uniform form.
    expect(DEFAULT_CORPORATE_FIELDS).toHaveProperty('list')
    expect(DEFAULT_CORPORATE_FIELDS).toHaveProperty('detail')
    expect(DEFAULT_CORPORATE_FIELDS).not.toHaveProperty('form')
  })

  it('DEFAULT_CORPORATE_FIELDS — every value is a boolean', () => {
    for (const section of ['list', 'detail'] as const) {
      for (const val of Object.values(DEFAULT_CORPORATE_FIELDS[section])) {
        expect(typeof val).toBe('boolean')
      }
    }
  })

  it('DEFAULT_DEAL_FIELDS has only a list sub-object', () => {
    // DealFieldConfig is list-only because deal detail re-uses
    // the Inquiry detail page (controlled by inquiry_fields.detail).
    expect(DEFAULT_DEAL_FIELDS).toHaveProperty('list')
    expect(DEFAULT_DEAL_FIELDS).not.toHaveProperty('form')
    expect(DEFAULT_DEAL_FIELDS).not.toHaveProperty('detail')
  })

  it('DEFAULT_DEAL_FIELDS — every value is a boolean', () => {
    for (const val of Object.values(DEFAULT_DEAL_FIELDS.list)) {
      expect(typeof val).toBe('boolean')
    }
  })

  it('DEFAULT_MEMBER_FIELDS has list + detail sub-objects', () => {
    expect(DEFAULT_MEMBER_FIELDS).toHaveProperty('list')
    expect(DEFAULT_MEMBER_FIELDS).toHaveProperty('detail')
  })

  it('DEFAULT_TASK_FIELDS has only a list sub-object', () => {
    expect(DEFAULT_TASK_FIELDS).toHaveProperty('list')
    expect(DEFAULT_TASK_FIELDS).not.toHaveProperty('detail')
  })

  it('DEFAULT_MEMBER_FIELDS and DEFAULT_TASK_FIELDS — every value is boolean', () => {
    for (const val of Object.values(DEFAULT_MEMBER_FIELDS.list)) {
      expect(typeof val).toBe('boolean')
    }
    for (const val of Object.values(DEFAULT_MEMBER_FIELDS.detail)) {
      expect(typeof val).toBe('boolean')
    }
    for (const val of Object.values(DEFAULT_TASK_FIELDS.list)) {
      expect(typeof val).toBe('boolean')
    }
  })
})

describe('INQUIRY_LIST_FIELD_META picker manifest', () => {
  it('covers every list-field key in DEFAULT_INQUIRY_FIELDS.list', () => {
    // Drift guard: a new toggle added to DEFAULT_INQUIRY_FIELDS.list
    // without a matching meta entry would render in the picker
    // without a label.
    const defaultKeys = new Set(Object.keys(DEFAULT_INQUIRY_FIELDS.list))
    const metaKeys = new Set(INQUIRY_LIST_FIELD_META.map(m => m.key))
    for (const key of defaultKeys) {
      expect(metaKeys.has(key as any)).toBe(true)
    }
  })

  it('every meta entry has a non-empty label', () => {
    for (const entry of INQUIRY_LIST_FIELD_META) {
      expect(typeof entry.label).toBe('string')
      expect(entry.label.length).toBeGreaterThan(0)
    }
  })

  it('every meta entry has a unique key', () => {
    const keys = INQUIRY_LIST_FIELD_META.map(m => m.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })
})

describe('DEAL_LIST_FIELD_META picker manifest', () => {
  it('covers every list-field key in DEFAULT_DEAL_FIELDS.list', () => {
    const defaultKeys = new Set(Object.keys(DEFAULT_DEAL_FIELDS.list))
    const metaKeys = new Set(DEAL_LIST_FIELD_META.map(m => m.key))
    for (const key of defaultKeys) {
      expect(metaKeys.has(key as any)).toBe(true)
    }
  })

  it('every meta entry has a non-empty label', () => {
    for (const entry of DEAL_LIST_FIELD_META) {
      expect(typeof entry.label).toBe('string')
      expect(entry.label.length).toBeGreaterThan(0)
    }
  })

  it('every meta entry has a unique key', () => {
    const keys = DEAL_LIST_FIELD_META.map(m => m.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })
})
