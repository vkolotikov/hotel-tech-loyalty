import { describe, expect, it } from 'vitest'
import type { BioPayload } from '../lib/types'
import {
  MAX_BUTTONS, addButton, addressOf, bioBody, bioFormOf, bioProblems, focusAfterMove, focusAfterRemove, freshBio, moveButton, refusedFields,
  removeButton, renamedFrom, slugInput,
} from './bioForm'

const payload = (more: Partial<BioPayload> = {}): BioPayload => ({
  page: { is_on: true, slug: 'lumiere', title: null, line: 'Hair & colour', show_posts: true },
  buttons: [
    { id: 4, label: 'Book now', destination: 'https://lumiere.example/book', short_url: 'https://sites.hexa-tech.uk/go/abc2345', clicks_30d: 6 },
    { id: 5, label: 'Gift cards', destination: 'https://lumiere.example/gifts', short_url: 'https://sites.hexa-tech.uk/go/def2345', clicks_30d: 0 },
  ],
  url: 'https://sites.hexa-tech.uk/links/lumiere', suggested_name: 'lumiere-salon', base_url: 'https://sites.hexa-tech.uk/links/', ...more,
})

describe('the link-in-bio form (spec 2026-10-19 §6.4)', () => {
  it('starts from the saved page, or — before the first save — off, with the suggested name and the posts shown', () => {
    expect(bioFormOf(payload())).toEqual({
      is_on: true, slug: 'lumiere', title: '', line: 'Hair & colour', show_posts: true, buttons: [
        { key: 'b4', id: 4, label: 'Book now', destination: 'https://lumiere.example/book' },
        { key: 'b5', id: 5, label: 'Gift cards', destination: 'https://lumiere.example/gifts' },
      ],
    })
    expect(bioFormOf(payload({ page: null, buttons: [], url: null }))).toEqual({ is_on: false, slug: 'lumiere-salon', title: '', line: '', show_posts: true, buttons: [] })
  })

  it('sends the whole page in order: words trimmed, empty words as null, a kept button with its id and a new one without', () => {
    const form = bioFormOf(payload())
    const buttons = addButton(moveButton(form.buttons, 1, -1), 'n0')
      .map(b => (b.key === 'n0' ? { ...b, label: ' Prices ', destination: ' https://lumiere.example/prices ' } : b))
    expect(bioBody({ ...form, title: '  ', line: ' Hair ', buttons })).toEqual({
      is_on: true, slug: 'lumiere', title: null, line: 'Hair', show_posts: true,
      buttons: [
        { id: 5, label: 'Gift cards', destination: 'https://lumiere.example/gifts' },
        { id: 4, label: 'Book now', destination: 'https://lumiere.example/book' },
        { label: 'Prices', destination: 'https://lumiere.example/prices' },
      ],
    })
  })

  it('moves, adds up to eight and removes buttons; a move past an end changes nothing', () => {
    const { buttons } = bioFormOf(payload())
    expect(moveButton(buttons, 0, -1)).toBe(buttons)
    expect(moveButton(buttons, 1, 1)).toBe(buttons)
    expect(moveButton(buttons, 0, 1).map(b => b.key)).toEqual(['b5', 'b4'])
    expect(removeButton(buttons, 0).map(b => b.key)).toEqual(['b5'])
    let many = buttons
    for (let i = 0; i < 10; i++) many = addButton(many, `n${i}`)
    expect(many).toHaveLength(MAX_BUTTONS)
  })

  it('types a name in lowercase with hyphens for spaces, and shows the address it will have', () => {
    expect(slugInput('Lumiere Salon')).toBe('lumiere-salon')
    expect(addressOf('https://sites.hexa-tech.uk/links/', 'lumiere')).toBe('https://sites.hexa-tech.uk/links/lumiere')
  })

  it('checks the name and every button before anything is sent', () => {
    const form = bioFormOf(payload())
    expect(bioProblems(form)).toEqual([])
    for (const slug of ['ab', 'lumière', '-lumiere', 'lumiere-', 'a'.repeat(64)]) expect(bioProblems({ ...form, slug }), slug).toEqual(['slug'])
    const buttons = [{ key: 'n0', id: null, label: ' ', destination: 'lumiere.example' }, ...form.buttons]
    expect(bioProblems({ ...form, buttons })).toEqual(['buttons.0.label', 'buttons.0.destination'])
  })

  // Review Focus 2: renaming a page that is out in the world.
  it('names the old address when a saved page is renamed, and nothing for a new page or the same name', () => {
    expect(renamedFrom(payload(), { ...bioFormOf(payload()), slug: 'lumiere-riga' })).toBe('https://sites.hexa-tech.uk/links/lumiere')
    expect(renamedFrom(payload(), bioFormOf(payload()))).toBeNull()
    expect(renamedFrom(payload({ page: null, url: null }), { ...bioFormOf(payload()), slug: 'other' })).toBeNull()
  })

  it('marks the name for a name refusal, the buttons for too many, and the fields a refused form names', () => {
    expect(refusedFields('bio_name_taken')).toEqual(['slug'])
    expect(refusedFields('bio_name_invalid')).toEqual(['slug'])
    expect(refusedFields('too_many_buttons')).toEqual(['buttons'])
    expect(refusedFields('invalid', { 'buttons.1.label': ['x'], title: ['y'] })).toEqual(['buttons.1.label', 'title'])
  })

  // Review Focus 4: the keyboard stays with the button it moved.
  it('keeps the keyboard on the moved button’s row, and sends it on after a removal', () => {
    const three = ['b1', 'b2', 'b3'].map(key => ({ key, id: null, label: '', destination: '' }))
    expect(focusAfterMove(three, 2, -1)).toBe('[data-bio-row="b3"] [data-move="up"]')
    expect(focusAfterMove(three, 1, -1)).toBe('[data-bio-row="b2"] [data-move="down"]')
    expect(focusAfterMove(three, 1, 1)).toBe('[data-bio-row="b2"] [data-move="up"]')
    expect(focusAfterMove(three, 0, -1)).toBeNull()
    expect(focusAfterRemove(three, 1)).toBe('[data-bio-row="b3"] [data-remove]')
    expect(focusAfterRemove(three, 2)).toBe('[data-bio-row="b2"] [data-remove]')
    expect(focusAfterRemove(three.slice(0, 1), 0)).toBe('[data-bio-add]')
  })
})

// Final review: Edit built the draft from a copy that could be hours old, and Save replaces the whole page — a change
// made on another device (page switched on, a button added) was undone without a word.
describe('opening the editor', () => {
  it('starts from the page as the server has it now, else from the copy held', async () => {
    const newer = payload({ page: { is_on: true, slug: 'lumiere', title: 'Lumière', line: null, show_posts: true } })
    expect(await freshBio(async () => ({ data: newer }), payload({ page: null }))).toBe(newer)
    const held = payload()
    expect(await freshBio(async () => ({ data: undefined }), held)).toBe(held)
    expect(await freshBio(async () => { throw new Error('offline') }, held)).toBe(held)
  })
})
