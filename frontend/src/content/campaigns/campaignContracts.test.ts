import { describe, expect, it } from 'vitest'
import { changes, createBody, newForm, rebase } from '../panel/panelState'
import { NO_FILTERS, readFilters, writeFilters } from '../posts/postsFilters'
import { exportParams } from '../lib/api'

describe('campaign selection across the shared editor and filtered downloads', () => {
  it('normalizes assignment, clearing, Create and later typing during Save', () => {
    const base = newForm({ date: null, platform: null }, ['instagram'])
    const chosen = { ...base, campaign_id: '17' }
    expect(changes(base, chosen)).toEqual({ campaign_id: 17 })
    expect(changes(chosen, base)).toEqual({ campaign_id: null })
    expect(createBody(chosen)).toMatchObject({ campaign_id: 17 })
    expect(rebase(chosen, { ...chosen, campaign_id: '18' }, chosen).campaign_id).toBe('18')
  })
  it('preserves campaign URL filters and excludes page from exports', () => {
    const filters = { ...NO_FILTERS, campaign_id: 17, page: 4, q: ' Riga ' }
    expect(readFilters(writeFilters(filters), [], [])).toMatchObject({ campaign_id: 17, page: 4 })
    expect(exportParams(filters)).toEqual({ campaign_id: 17, q: 'Riga' })
    expect(exportParams({ ...NO_FILTERS, platforms: ['instagram', 'linkedin'] })).toEqual({ platforms: ['instagram', 'linkedin'] })
  })
})
