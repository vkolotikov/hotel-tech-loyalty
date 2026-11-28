import { expect, it, vi } from 'vitest'
import { categoryLabel } from './category'

it('translates known and legacy categories', () => {
  const say = vi.fn((_key: string, fallback: string) => `Translated ${fallback}`)
  expect(categoryLabel('dining', say)).toBe('Translated Dining')
  expect(categoryLabel('food_beverage', say)).toBe('Translated Food & drink')
})

it.each(['constructor', 'toString', '__proto__'])('renders the custom category %s as plain text', value => {
  const say = vi.fn((_key: string, fallback: string) => fallback)
  const label = categoryLabel(value, say)
  expect(typeof label).toBe('string')
  expect(say).not.toHaveBeenCalled()
})

it('makes custom separators readable without treating their content as a translation key', () => {
  const say = vi.fn((_key: string, fallback: string) => fallback)
  expect(categoryLabel('seasonal_weekend', say)).toBe('seasonal weekend')
  expect(categoryLabel(null, say)).toBe('—')
  expect(say).not.toHaveBeenCalled()
})
