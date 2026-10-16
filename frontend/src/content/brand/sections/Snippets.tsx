import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Sparkles } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { BrandPayload, Snippet, SnippetKind, SnippetSuggestion } from '../../lib/types'
import { TextField } from '../inputs'
import { MAX_SNIPPETS, removeSnippet, saveSnippet, snippetForm, snippetProblem, snippetsOf, type SnippetForm } from '../snippetActions'
import { useBrand } from '../useBrand'

/** One hashtag group or snippet being written: a name and its text; Save checks both before sending. */
function SnippetEditor({ kind, snippet, onDone }: { kind: SnippetKind; snippet: Snippet | null; onDone: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const { adopt } = useBrand()
  const [form, setForm] = useState<SnippetForm>(() => snippetForm(snippet))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.brand.snippets.${key}`, english)

  const save = async () => {
    const problem = snippetProblem(form)
    if (problem) {
      const [key, text] = errorKey('snippet', problem)
      setError(t(key, text))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveSnippet({ api, adopt }, snippet, kind, form)
      onDone()
    } catch (e) {
      const [key, text] = errorKey('snippet', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-a-border p-3">
      <TextField label={w('name', 'Name')} value={form.name} maxLength={60} required onChange={(name) => setForm({ ...form, name })} />
      <TextField label={kind === 'hashtags' ? w('tags', 'Hashtags') : w('text', 'Text')} value={form.body} maxLength={2000} rows={kind === 'hashtags' ? 2 : 3}
        hint={kind === 'hashtags' ? w('tags_hint', 'Separate them with spaces.') : undefined} onChange={(body) => setForm({ ...form, body })} />
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { void save() }} loading={busy}>{t('content.brand.save', 'Save')}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={onDone}>{t('content.common.cancel', 'Cancel')}</Button>
      </div>
    </div>
  )
}

/** The AI's hashtag groups for this brand (one call, nothing saved): each added on its own with Add. */
function Suggestions({ full }: { full: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const { adopt } = useBrand()
  const [items, setItems] = useState<SnippetSuggestion[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const paused = boot.ai.status === 'over'
  const w = (key: string, english: string) => t(`content.brand.snippets.${key}`, english)
  const fail = (e: unknown) => {
    const [key, text] = errorKey('snippet', failureOf(e).code)
    setError(t(key, text))
  }

  const ask = async () => {
    setBusy('ask')
    setError(null)
    try {
      setItems((await api.suggestSnippets()).suggestions)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }
  const add = async (item: SnippetSuggestion) => {
    setBusy(item.name)
    setError(null)
    try {
      await saveSnippet({ api, adopt }, null, 'hashtags', item)
      setItems(list => (list ?? []).filter(s => s !== item))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-a-border p-3">
      <Button size="sm" variant="secondary" loading={busy === 'ask'} disabled={paused || busy !== null} onClick={() => { void ask() }}>
        <Sparkles size={14} aria-hidden />{w('suggest', 'Suggest hashtag groups with AI')}
      </Button>
      {paused && <p className="text-xs text-a-text-2">{t('content.snippet.error.ai_budget_used_up', "This month's AI budget is used up.")}</p>}
      {items !== null && items.length === 0 && <p className="text-sm text-a-text-2">{w('no_suggestions', 'No more suggestions. Ask again for new ones.')}</p>}
      {items?.map(item => (
        <div key={item.name} className="flex flex-wrap items-start gap-3 rounded-lg bg-a-surface-2 p-2.5">
          <div className="min-w-0 grow basis-48">
            <p className="text-sm font-semibold text-a-text">{item.name}</p>
            <p className="break-words text-xs text-a-text-2">{item.body}</p>
          </div>
          <Button size="sm" variant="secondary" loading={busy === item.name} disabled={full || (busy !== null && busy !== item.name)} onClick={() => { void add(item) }}>
            {w('add_suggestion', 'Add')}
          </Button>
        </div>
      ))}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  )
}

/** One kind's list: its rows, and for managers Add, Edit, Remove (asking first), and — for hashtag groups — the AI's suggestions. */
function SnippetList({ kind, brand, canEdit }: { kind: SnippetKind; brand: BrandPayload; canEdit: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const { adopt } = useBrand()
  const [open, setOpen] = useState<number | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const list = snippetsOf(brand, kind)
  const full = list.length >= MAX_SNIPPETS
  const w = (key: string, english: string) => t(`content.brand.snippets.${key}`, english)

  const remove = async (snippet: Snippet) => {
    if (!window.confirm(t('content.brand.snippets.remove_confirm', 'Remove “{{name}}”?', { name: snippet.name }))) return
    setError(null)
    try {
      await removeSnippet({ api, adopt }, snippet.id)
    } catch (e) {
      const [key, text] = errorKey('snippet', failureOf(e).code)
      setError(t(key, text))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2">{kind === 'hashtags' ? w('groups', 'Hashtag groups') : w('texts', 'Snippets')}</h3>
        {canEdit && open !== 'new' && (
          <Button size="sm" variant="secondary" disabled={full} onClick={() => setOpen('new')}>
            <Plus size={14} aria-hidden />{kind === 'hashtags' ? w('add_group', 'Add a hashtag group') : w('add_text', 'Add a snippet')}
          </Button>
        )}
      </div>
      {canEdit && full && <p className="text-xs text-a-text-2">{t('content.snippet.error.too_many_snippets', 'A brand keeps at most 50 of each. Remove one first.')}</p>}
      {open === 'new' && <SnippetEditor kind={kind} snippet={null} onDone={() => setOpen(null)} />}
      {list.length === 0 && open !== 'new' && <p className="text-sm text-a-text-2">{kind === 'hashtags' ? w('none_groups', 'No hashtag groups yet.') : w('none_texts', 'No snippets yet.')}</p>}
      <ul className="space-y-2">
        {list.map(snippet => (
          <li key={snippet.id}>
            {open === snippet.id
              ? <SnippetEditor kind={kind} snippet={snippet} onDone={() => setOpen(null)} />
              : (
                // The words keep 12rem (basis-48): on a phone the buttons wrap below them instead of squeezing them.
                <div className="flex flex-wrap items-start gap-3 rounded-lg border border-a-border p-3">
                  <div className="min-w-0 grow basis-48">
                    <p className="truncate text-sm font-semibold text-a-text">{snippet.name}</p>
                    <p className="whitespace-pre-line break-words text-xs text-a-text-2">{snippet.body}</p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setOpen(snippet.id)}>{t('content.brand.edit', 'Edit')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => { void remove(snippet) }}>{w('remove', 'Remove')}</Button>
                    </div>
                  )}
                </div>
              )}
          </li>
        ))}
      </ul>
      {kind === 'hashtags' && canEdit && <Suggestions full={full} />}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  )
}

/**
 * Hashtags and snippets (spec 2026-10-15 §6): hashtag groups and lines used often — a call to action, a sign-off, an
 * address — that the post panel puts in with one click. Everyone reads them; managers keep them.
 */
export function SnippetsSection({ brand, canEdit }: { brand: BrandPayload; canEdit: boolean }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="content-snippets" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="space-y-0.5">
        <h2 id="content-snippets" className="font-a-display text-lg font-normal text-a-text">{t('content.brand.snippets.title', 'Hashtags and snippets')}</h2>
        <p className="text-sm text-a-text-2">{t('content.brand.snippets.intro', 'Hashtag groups and lines you use often — a call to action, a sign-off, an address. The post panel puts them in with one click.')}</p>
      </div>
      <SnippetList kind="hashtags" brand={brand} canEdit={canEdit} />
      <SnippetList kind="text" brand={brand} canEdit={canEdit} />
    </section>
  )
}
