import { describe, expect, it } from 'vitest'
import { firstLetter, initialsOf } from './firstLetter'

describe('firstLetter', () => {
  it('takes the first letter of a trimmed name, upper-cased', () => {
    expect(firstLetter('  lumière salon', 'H')).toBe('L')
    expect(firstLetter('Яна', 'H')).toBe('Я')
  })

  it('keeps a whole emoji instead of half of its surrogate pair', () => {
    expect(firstLetter('🌸 Bloom', 'H')).toBe('🌸')
    expect(firstLetter('🌸 Bloom', 'H')).not.toBe('\ud83c')
  })

  it('falls back when there is no name', () => {
    expect(firstLetter(undefined, 'H')).toBe('H')
    expect(firstLetter('', 'H')).toBe('H')
    expect(firstLetter('   ', 'H')).toBe('H')
    expect(firstLetter(undefined, '')).toBe('')
  })
})

describe('initialsOf', () => {
  it('takes the first letters of the first two words, upper-cased', () => {
    expect(initialsOf('Mara Ilves-Kask')).toBe('MI')
    expect(initialsOf('  sophie  anne williams ')).toBe('SA')
    expect(initialsOf('Яна')).toBe('Я')
  })

  it('keeps a whole emoji as one initial and returns nothing for an empty name', () => {
    expect(initialsOf('🌸 Rose')).toBe('🌸R')
    expect(initialsOf('anna 🌸 lee')).toBe('A🌸')
    expect(initialsOf('')).toBe('')
    expect(initialsOf('   ')).toBe('')
  })
})
