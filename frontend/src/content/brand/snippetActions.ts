import type { ContentApi } from '../lib/api'
import type { BrandPayload, Snippet, SnippetKind } from '../lib/types'

/** A brand keeps at most this many of each kind (the server's ContentPlannerSnippet::MAX_PER_KIND). */
export const MAX_SNIPPETS = 50

/** A brand's hashtag groups or its text snippets, in the server's order. */
export const snippetsOf = (brand: BrandPayload | null, kind: SnippetKind): Snippet[] => (brand?.snippets ?? []).filter(s => s.kind === kind)

/** One hashtag group or snippet as typed. */
export interface SnippetForm { name: string; body: string }
export const snippetForm = (s: Snippet | null): SnippetForm => ({ name: s?.name ?? '', body: s?.body ?? '' })

/** What stops a save before the server sees it (it would refuse it too): no name, or no text. */
export const snippetProblem = (f: SnippetForm): 'invalid' | null => (f.name.trim() === '' || f.body.trim() === '' ? 'invalid' : null)

type Adopt = (payload: BrandPayload) => void

/** A new hashtag group or snippet, or an edit with only what changed (nothing sent for no change); the brand's answer is adopted. */
export async function saveSnippet(
  { api, adopt }: { api: Pick<ContentApi, 'createSnippet' | 'updateSnippet'>; adopt: Adopt },
  snippet: Snippet | null, kind: SnippetKind, form: SnippetForm,
): Promise<void> {
  const name = form.name.trim()
  const body = form.body.trim()
  if (snippet === null) {
    adopt(await api.createSnippet({ kind, name, body }))
    return
  }
  const fields: { name?: string; body?: string } = {}
  if (name !== snippet.name) fields.name = name
  if (body !== snippet.body) fields.body = body
  if (Object.keys(fields).length === 0) return
  adopt(await api.updateSnippet(snippet.id, fields))
}

export async function removeSnippet({ api, adopt }: { api: Pick<ContentApi, 'deleteSnippet'>; adopt: Adopt }, id: number): Promise<void> {
  adopt(await api.deleteSnippet(id))
}
