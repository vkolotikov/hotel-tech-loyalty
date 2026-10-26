import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { answerFixture } from './fixture'
import { STAGES, WAY_STAGES, partCount, stepLive, stepsOf } from './journey'
import { STAGE_WORDS } from './words'

describe('Ways to earn’s journey (owner 2026-10-26)', () => {
  it('places every way the server has at a step of its own, on purpose', () => {
    const php = fs.readFileSync(path.resolve(__dirname, '../../../../app/Services/Loyalty/Programme/ProgrammeOptions.php'), 'utf8')
    const block = php.slice(php.indexOf('public const WAYS = ['), php.indexOf('];', php.indexOf('public const WAYS = [')))
    const keys = [...block.matchAll(/^\s*'([a-z_]+)'\s*=>/gm)].map(m => m[1])
    expect(keys.length).toBeGreaterThanOrEqual(11)
    expect(keys.filter(key => !WAY_STAGES[key])).toEqual([])
    for (const stage of STAGES) expect(STAGE_WORDS[stage], stage).toBeTruthy()
  })

  it('walks the steps in order, each with its ways in the server’s order and the parts it leads to', () => {
    const answer = answerFixture()
    expect(stepsOf(answer.ways).map(s => [s.stage, s.ways.map(w => w.key), s.parts])).toEqual([
      ['join', ['welcome_bonus'], []],
      ['visit', ['earn_rate', 'points_on_spend', 'stamp_card', 'check_in', 'desk_earn', 'cashback'], ['boosts']],
      ['celebrate', ['birthday_bonus'], []],
      ['friends', ['referrals'], []],
      ['move_up', [], ['tiers']],
      ['spend', [], ['rewards', 'offers']],
      ['keep', ['points_expiry'], []],
    ])
    expect(partCount('rewards', answer)).toBe(2)
    expect(partCount('tiers', answer)).toBe(3)
  })

  it('a step is live when a way of it is on and used here, or the programme has the tiers or rewards it leads to', () => {
    const answer = answerFixture()
    const steps = Object.fromEntries(stepsOf(answer.ways).map(s => [s.stage, s]))
    expect(stepLive(steps.join, answer)).toBe(true)
    expect(stepLive(steps.spend, answer)).toBe(true)
    expect(stepLive(steps.spend, answerFixture({ catalogue: { ...answer.catalogue, rewards: [] } }))).toBe(false)
    expect(stepLive(steps.celebrate, answerFixture({ options: { ...answer.options, birthday_bonus_points: 0 } }))).toBe(false)
    // A way that does nothing at this venue does not make its step live.
    const visit = { ways: steps.visit.ways.filter(w => w.key === 'points_on_spend'), parts: [] }
    expect(stepLive(visit, answer)).toBe(true)
    expect(stepLive(visit, answerFixture({ not_used: ['points_on_spend'] }))).toBe(false)
  })
})
