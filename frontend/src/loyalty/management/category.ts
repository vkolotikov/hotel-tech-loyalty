import { CATEGORY_WORDS } from '../program/words'

/** Historic keys and a venue's free-form categories are display labels, never replacement API values. */
export function categoryLabel(value: string | null, say: (key: string, fallback: string) => string): string {
  if (!value) return '—'
  if (value === 'food_beverage') return say('loyalty.adminux.foodAndDrink', 'Food & drink')
  if (Object.prototype.hasOwnProperty.call(CATEGORY_WORDS, value)) return say(`loyalty.program.category.${value}`, CATEGORY_WORDS[value])
  return value.replace(/_+/g, ' ').trim() || value
}
