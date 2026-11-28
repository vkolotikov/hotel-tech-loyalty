import { expect, it } from 'vitest'
import { acknowledgeBio } from './bioAcknowledgement'
import { bioBody, type BioForm } from './bioForm'
import type { BioPayload } from '../lib/types'

it('retains later typing and ordering while adopting new button identities for the next Save', () => {
  const submitted: BioForm = { is_on: true, slug: 'our-brand', title: '', line: '', show_posts: true,
    buttons: [{ key: 'n0', id: null, label: 'Sent', destination: 'https://example.test' }] }
  const latest = { ...submitted, buttons: [
    { key: 'n1', id: null, label: 'Added later', destination: 'https://example.test/later' },
    { ...submitted.buttons[0], label: 'Typed later' },
  ] }
  const answer = { page: { is_on: true, slug: 'our-brand', title: null, line: null, show_posts: true },
    buttons: [{ id: 55, label: 'Sent', destination: 'https://example.test' }] } as BioPayload
  const result = acknowledgeBio(submitted, latest, answer)
  expect(result.draft.buttons.map(b => [b.key, b.id, b.label])).toEqual([['n1', null, 'Added later'], ['n0', 55, 'Typed later']])
  expect(bioBody(result.draft).buttons[1].id).toBe(55)
  expect(result.base.buttons[0]).toMatchObject({ key: 'n0', id: 55 })
})

it('does not resurrect a button removed while Save was pending', () => {
  const submitted: BioForm = { is_on: false, slug: 'brand', title: '', line: '', show_posts: true,
    buttons: [{ key: 'n0', id: null, label: 'Sent', destination: 'https://example.test' }] }
  const answer = { page: submitted, buttons: [{ id: 55, label: 'Sent', destination: 'https://example.test' }] } as unknown as BioPayload
  expect(acknowledgeBio(submitted, { ...submitted, buttons: [] }, answer).draft.buttons).toEqual([])
})
