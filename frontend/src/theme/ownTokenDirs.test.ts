import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { OWN_TOKEN_DIRS } from './ownTokenDirs'

const SRC = path.resolve(__dirname, '..')
/** Every admin sweep that walks src/ and skips the folders with tokens of their own. */
const SWEEPS = [
  'components/switchKnobs.test.ts',
  'theme/brandFills.test.ts',
  'theme/fixedInBlur.test.ts',
  'theme/hxColours.test.ts',
  'theme/lightSweep.test.ts',
  'theme/onFill.test.ts',
  'theme/rawColourRatchet.test.ts',
]
const OWN_LIST = /rel === 'appointments'|\['portal', 'appointments'/

describe('folders the admin sweeps skip', () => {
  it('are the member portal, Appointments, the shared workspace core and Content', () => {
    expect([...OWN_TOKEN_DIRS]).toEqual(['portal', 'appointments', 'workspace', 'content'])
  })

  for (const file of SWEEPS) {
    it(`${file} skips them through OWN_TOKEN_DIRS, not a list of its own`, () => {
      const source = fs.readFileSync(path.join(SRC, file), 'utf8')
      expect(source).toContain('OWN_TOKEN_DIRS')
      expect(source).not.toMatch(OWN_LIST)
    })
  }

  it('no other test walks src/ with a skip list of its own', () => {
    const tests = fs.readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .map(f => f.split(path.sep).join('/'))
      .filter(f => /\.test\.tsx?$/.test(f) && !SWEEPS.includes(f) && f !== 'theme/ownTokenDirs.test.ts')
    expect(tests.filter(f => OWN_LIST.test(fs.readFileSync(path.join(SRC, f), 'utf8')))).toEqual([])
  })
})
