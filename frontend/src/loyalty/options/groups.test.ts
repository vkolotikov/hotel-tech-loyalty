import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { GROUP_ORDER, WAY_GROUPS, groupsOf } from './groups'
import { GROUP_WORDS } from './words'
import type { Way } from './types'

const way = (key: string): Way => ({ key, switch: null, zero_off: null, fields: [] })

describe('Ways to earn’s sections (design pass 2026-10-26)', () => {
  it('puts every way the server has in a section of its own (a new one is placed on purpose, not left under More)', () => {
    const php = fs.readFileSync(path.resolve(__dirname, '../../../../app/Services/Loyalty/Programme/ProgrammeOptions.php'), 'utf8')
    const block = php.slice(php.indexOf('public const WAYS = ['), php.indexOf('];', php.indexOf('public const WAYS = [')))
    const keys = [...block.matchAll(/^\s*'([a-z_]+)'\s*=>/gm)].map(m => m[1])
    expect(keys.length).toBeGreaterThanOrEqual(10)
    expect(keys.filter(key => !WAY_GROUPS[key])).toEqual([])
  })

  it('keeps the sections’ order and the server’s order within each, leaves empty ones out, and puts an unknown way under More', () => {
    const ways = ['points_expiry', 'welcome_bonus', 'points_on_spend', 'mystery', 'check_in'].map(way)
    expect(groupsOf(ways).map(g => [g.group, g.ways.map(w => w.key)])).toEqual([
      ['earn', ['points_on_spend', 'check_in']],
      ['bonus', ['welcome_bonus']],
      ['rule', ['points_expiry']],
      ['more', ['mystery']],
    ])
    expect(groupsOf([way('welcome_bonus')]).map(g => g.group)).toEqual(['bonus'])
    for (const group of GROUP_ORDER) expect(GROUP_WORDS[group]).toBeTruthy()
  })
})
