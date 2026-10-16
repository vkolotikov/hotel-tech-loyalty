import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { BrandPayload, Snippet } from '../lib/types'
import { removeSnippet, saveSnippet, snippetProblem, snippetsOf } from './snippetActions'

const brand = { snippets: [{ id: 1, kind: 'hashtags', name: 'A', body: '#a' }, { id: 2, kind: 'text', name: 'B', body: 'b' }] } as unknown as BrandPayload
const answer = { profile: null, snippet: { id: 1, kind: 'text', name: 'x', body: 'y' } } as unknown as BrandPayload & { snippet: Snippet }

describe('snippetActions', () => {
  it('lists one kind, and stops a save with no name or no text', () => {
    expect(snippetsOf(brand, 'text').map(s => s.id)).toEqual([2])
    expect(snippetsOf(null, 'hashtags')).toEqual([])
    expect(snippetProblem({ name: ' ', body: '#a' })).toBe('invalid')
    expect(snippetProblem({ name: 'A', body: '' })).toBe('invalid')
    expect(snippetProblem({ name: 'A', body: '#a' })).toBeNull()
  })

  it('creates with its kind, edits with only what changed, sends nothing for no change, removes by id', async () => {
    const api = { createSnippet: vi.fn(async () => answer), updateSnippet: vi.fn(async () => answer), deleteSnippet: vi.fn(async () => answer) }
    const adopt = vi.fn()
    await saveSnippet({ api, adopt }, null, 'hashtags', { name: ' Autumn ', body: '#autumn ' })
    expect(api.createSnippet).toHaveBeenCalledWith({ kind: 'hashtags', name: 'Autumn', body: '#autumn' })
    const existing: Snippet = { id: 4, kind: 'text', name: 'Sign-off', body: 'Bye' }
    await saveSnippet({ api, adopt }, existing, 'text', { name: 'Sign-off', body: 'See you!' })
    expect(api.updateSnippet).toHaveBeenCalledWith(4, { body: 'See you!' })
    await saveSnippet({ api, adopt }, existing, 'text', { name: 'Sign-off', body: 'Bye' })
    expect(api.updateSnippet).toHaveBeenCalledTimes(1)
    await removeSnippet({ api, adopt }, 4)
    expect(api.deleteSnippet).toHaveBeenCalledWith(4)
    expect(adopt).toHaveBeenCalledTimes(3)
  })
})
