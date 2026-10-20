import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { BioPayload } from '../../lib/types'
import { CopyButton } from '../../ui/CopyButton'
import { INPUT, ReadRow } from '../inputs'
import {
  MAX_BUTTONS, addButton, addressOf, bioBody, bioFormOf, bioProblems, focusAfterMove, focusAfterRemove, freshBio, moveButton, refusedFields,
  removeButton, renamedFrom, slugInput, type BioButtonForm, type BioForm,
} from '../bioForm'

const edge = (bad: boolean) => (bad ? 'border-a-danger' : 'border-a-border')
const ICON = 'rounded-md border border-a-border p-1.5 text-a-text-2 hover:text-a-text disabled:opacity-40'

/**
 * Link-in-bio (spec 2026-10-19 §6.4), after Channels: the brand's one public page of links and latest posts. Everyone
 * reads it — staff get its address with Copy while it is on; managers open an editor that saves the page and its buttons
 * in one call (a button keeps its short link while it exists; removing one switches its link off). The portal checks the
 * name and the buttons first; the server stays the judge.
 */
export function LinkInBioSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const brandId = useBrandId()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['content', brandId, 'bio'], queryFn: api.bio, staleTime: 60_000 })
  const [draft, setDraft] = useState<BioForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<string[]>([])
  const box = useRef<HTMLElement>(null)
  const focusAfter = useRef<string | null>(null)
  const brandName = boot.brand?.name ?? ''
  const bio = query.data

  // Edit puts the keyboard in the form, Save and Cancel back on Edit, a refusal on the first marked field, a move or a
  // removal where the editor says (a selector set in the handler, read here after the render).
  useEffect(() => {
    const want = focusAfter.current
    if (!want) return
    focusAfter.current = null
    box.current?.querySelector<HTMLElement>(want)?.focus()
  })

  // The draft starts from the page as the server has it now: Save replaces the whole page, so a copy read hours ago would
  // undo what another device changed since (final review).
  const open = async (held: BioPayload) => {
    if (opening) return
    setOpening(true)
    const from = await freshBio(() => query.refetch(), held)
    setOpening(false)
    focusAfter.current = '[data-bio-editor] [role="switch"]'
    setError(null)
    setInvalid([])
    setDraft(bioFormOf(from))
  }
  const close = () => {
    focusAfter.current = '[data-bio-edit]'
    setDraft(null)
    setError(null)
    setInvalid([])
  }
  const save = async () => {
    if (draft === null || busy) return
    const problems = bioProblems(draft)
    if (problems.length > 0) {
      setInvalid(problems)
      const [key, text] = errorKey('bio', 'invalid')
      setError(t(key, text))
      focusAfter.current = '[aria-invalid="true"]'
      return
    }
    setBusy(true)
    setError(null)
    setInvalid([])
    try {
      const answer = await api.saveBio(bioBody(draft))
      queryClient.setQueryData(['content', brandId, 'bio'], answer)
      close()
    } catch (e) {
      const failure = failureOf(e)
      setInvalid(refusedFields(failure.code, failure.fields))
      const [key, text] = errorKey('bio', failure.code)
      setError(t(key, text))
      focusAfter.current = '[aria-invalid="true"], [data-bio-save]'
    } finally {
      setBusy(false)
    }
  }

  return (
    <section ref={box} data-bio="" aria-labelledby="content-bio" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="content-bio" className="font-a-display text-lg font-normal text-a-text">{t('content.bio.title', 'Link-in-bio')}</h2>
          <p className="text-sm text-a-text-2">{t('content.bio.intro', 'One page with your links and latest posts, for the link in your profiles.')}</p>
        </div>
        {canEdit && bio && draft === null && (
          <Button size="sm" variant="secondary" data-bio-edit="" loading={opening} onClick={() => { void open(bio) }}>
            {bio.page ? t('content.brand.edit', 'Edit') : t('content.bio.setup', 'Set up the page')}
          </Button>
        )}
      </div>
      {query.isLoading && <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}
      {query.isError && !bio && (
        <div className="space-y-2">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button size="sm" variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {bio && draft === null && <BioReadView bio={bio} canEdit={canEdit} brandName={brandName} />}
      {bio && draft !== null && (
        <BioEditor bio={bio} draft={draft} onChange={setDraft} invalid={invalid} error={error} busy={busy} brandName={brandName}
          onFocus={(selector) => { focusAfter.current = selector }} onSave={() => { void save() }} onCancel={close} />
      )}
    </section>
  )
}

/** The page's address with Copy, and Open page while it is on. */
function AddressLine({ address, open }: { address: string; open: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-a-text-2">{t('content.bio.address', 'Address')}</span>
      <span data-bio-address="" className="min-w-0 break-all font-a-mono text-sm text-a-text">{address}</span>
      <CopyButton text={address} label={t('content.bio.copy', 'Copy address')} />
      {open && (
        <a href={address} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-a-border px-3 py-1.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
          <ExternalLink size={14} aria-hidden />{t('content.bio.open', 'Open page')}
        </a>
      )}
    </div>
  )
}

/** The section as read: staff the address with Copy while the page is on; managers the page, its settings and its buttons. */
export function BioReadView({ bio, canEdit, brandName }: { bio: BioPayload; canEdit: boolean; brandName: string }) {
  const { t } = useTranslation()
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.bio.${key}`, english, vars)
  const page = bio.page
  const notOn = <p className="text-sm text-a-text-2">{w('none_staff', 'The page is not switched on.')}</p>
  if (!page) return canEdit ? <p className="text-sm text-a-text-2">{w('none_manager', 'No page yet.')}</p> : notOn
  const address = bio.url ?? addressOf(bio.base_url, page.slug)
  if (!canEdit) return page.is_on ? <AddressLine address={address} open={false} /> : notOn
  const onOff = (on: boolean) => (on ? t('content.brand.channels.on', 'On') : t('content.brand.channels.off', 'Off'))
  return (
    <div className="space-y-3">
      <AddressLine address={address} open={page.is_on} />
      <dl className="grid gap-3 sm:grid-cols-2">
        <ReadRow label={w('state', 'Page')} value={onOff(page.is_on)} />
        <ReadRow label={w('posts_state', 'Latest posts')} value={onOff(page.show_posts)} />
        <ReadRow label={w('page_title', 'Title')} value={page.title ?? brandName} />
        <ReadRow label={w('line', 'Line under the title')} value={page.line ?? ''} />
      </dl>
      <div>
        <h3 className="mb-1 text-xs font-medium text-a-text-2">{w('buttons', 'Buttons')}</h3>
        {bio.buttons.length === 0 ? <p className="text-sm text-a-text-2">{w('no_buttons', 'No buttons yet.')}</p> : (
          <ol className="space-y-2">
            {bio.buttons.map(button => (
              <li key={button.id} className="text-sm">
                <span className="block font-medium text-a-text">{button.label}</span>
                <span className="block break-all text-xs text-a-text-2">{button.destination ?? ''}</span>
                <span className="block text-xs text-a-text-2">{w('clicks_30d', 'Clicks in the last 30 days: {{count}}', { count: button.clicks_30d })}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

/**
 * The editor (managers): the switch, the name with the page's full address (and a warning when a saved page is renamed),
 * title, line, "Show latest posts", and up to eight buttons — add, edit, move up and down, remove — then Save or Cancel.
 */
export function BioEditor({ bio, draft, onChange, invalid, error, busy, brandName, onFocus, onSave, onCancel }: {
  bio: BioPayload
  draft: BioForm
  onChange: (draft: BioForm) => void
  invalid: string[]
  error: string | null
  busy: boolean
  brandName: string
  /** Where the keyboard goes after the change the handler makes next (a selector). */
  onFocus: (selector: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.bio.${key}`, english, vars)
  const counter = useRef(0)
  const bad = (key: string) => invalid.includes(key)
  const set = (part: Partial<BioForm>) => onChange({ ...draft, ...part })
  const setButton = (index: number, part: Partial<BioButtonForm>) => set({ buttons: draft.buttons.map((b, i) => (i === index ? { ...b, ...part } : b)) })
  const move = (index: number, by: -1 | 1) => {
    const target = focusAfterMove(draft.buttons, index, by)
    if (target) onFocus(target)
    set({ buttons: moveButton(draft.buttons, index, by) })
  }
  const remove = (index: number) => {
    onFocus(focusAfterRemove(draft.buttons, index))
    set({ buttons: removeButton(draft.buttons, index) })
  }
  const add = () => {
    const key = `n${counter.current++}`
    onFocus(`[data-bio-row="${key}"] input`)
    set({ buttons: addButton(draft.buttons, key) })
  }
  const old = renamedFrom(bio, draft)
  const full = draft.buttons.length >= MAX_BUTTONS

  return (
    <div data-bio-editor="" className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <button type="button" role="switch" aria-checked={draft.is_on} aria-labelledby="content-bio-switch" aria-describedby="content-bio-switch-line"
            onClick={() => set({ is_on: !draft.is_on })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${draft.is_on ? 'bg-a-accent' : 'bg-a-surface-2'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-a-surface shadow-a-sm transition ${draft.is_on ? 'left-[1.375rem]' : 'left-0.5'}`} />
          </button>
          <span id="content-bio-switch" className="text-sm text-a-text">{w('switch', 'Page is on')}</span>
        </div>
        <p id="content-bio-switch-line" className="text-xs text-a-text-2">{w('switch_line', 'While it is off, its address shows a page that is not found.')}</p>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{w('name', 'Name')}</span>
        <input value={draft.slug} maxLength={63} autoCapitalize="none" spellCheck={false} aria-invalid={bad('slug') || undefined} aria-describedby="content-bio-address"
          onChange={(e) => set({ slug: slugInput(e.target.value) })} className={`${INPUT} ${edge(bad('slug'))}`} />
        {/* Only the address may break anywhere (a long name on a phone); the hint wraps between its words. */}
        <span id="content-bio-address" className="mt-1 block text-xs text-a-text-2">
          <span className="break-all">{addressOf(bio.base_url, draft.slug.trim())}</span>
          {` · ${w('name_hint', 'Lowercase letters, digits and hyphens.')}`}
        </span>
      </label>
      {old && <Notice tone="warning">{w('rename', 'The old address stops working when you save: {{old}}', { old })}</Notice>}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{w('page_title', 'Title')}</span>
        <input value={draft.title} maxLength={60} placeholder={brandName} aria-invalid={bad('title') || undefined} onChange={(e) => set({ title: e.target.value })}
          className={`${INPUT} ${edge(bad('title'))}`} />
        <span className="mt-1 block text-xs text-a-text-2">{w('title_hint', 'Up to 60 characters. Empty: the brand’s name.')}</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-a-text-2">{w('line', 'Line under the title')}</span>
        <textarea value={draft.line} rows={2} maxLength={160} aria-invalid={bad('line') || undefined} onChange={(e) => set({ line: e.target.value })}
          className={`${INPUT} ${edge(bad('line'))}`} />
        <span className="mt-1 block text-xs text-a-text-2">{w('line_hint', 'Up to 160 characters.')}</span>
      </label>
      <label className="flex items-center gap-2 text-sm text-a-text">
        <input type="checkbox" checked={draft.show_posts} onChange={(e) => set({ show_posts: e.target.checked })} />
        {w('show_posts', 'Show the latest posts that have a link')}
      </label>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-a-text-2">{w('buttons', 'Buttons')}</legend>
        {draft.buttons.length === 0 && <p className="text-sm text-a-text-2">{w('no_buttons', 'No buttons yet.')}</p>}
        <ol className="space-y-2">
          {draft.buttons.map((button, i) => {
            const n = i + 1
            return (
              <li key={button.key} data-bio-row={button.key} className="space-y-2 rounded-lg border border-a-border p-2">
                <input value={button.label} maxLength={40} aria-label={w('button_label', 'Button {{n}}: label', { n })} aria-invalid={bad(`buttons.${i}.label`) || undefined}
                  onChange={(e) => setButton(i, { label: e.target.value })} className={`${INPUT} ${edge(bad(`buttons.${i}.label`))}`} />
                <input type="url" inputMode="url" value={button.destination} maxLength={2000} placeholder="https://" aria-label={w('button_address', 'Button {{n}}: address', { n })}
                  aria-invalid={bad(`buttons.${i}.destination`) || undefined} onChange={(e) => setButton(i, { destination: e.target.value })}
                  className={`${INPUT} ${edge(bad(`buttons.${i}.destination`))}`} />
                <div className="flex gap-1">
                  <button type="button" data-move="up" disabled={i === 0} aria-label={w('up', 'Move button {{n}} up', { n })} onClick={() => move(i, -1)} className={ICON}>
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button type="button" data-move="down" disabled={i === draft.buttons.length - 1} aria-label={w('down', 'Move button {{n}} down', { n })} onClick={() => move(i, 1)} className={ICON}>
                    <ArrowDown size={14} aria-hidden />
                  </button>
                  <button type="button" data-remove="" aria-label={w('remove', 'Remove button {{n}}', { n })} onClick={() => remove(i)} className={`${ICON} ml-auto`}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
        <Button size="sm" variant="secondary" data-bio-add="" disabled={full} onClick={add}><Plus size={14} aria-hidden />{w('add', 'Add a button')}</Button>
        <p className="text-xs text-a-text-2">{full ? w('max', 'A page has at most 8 buttons.') : w('removed_note', 'Removing a button switches its short link off.')}</p>
      </fieldset>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button data-bio-save="" loading={busy} onClick={onSave}>{t('content.brand.save', 'Save')}</Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>{t('content.common.cancel', 'Cancel')}</Button>
      </div>
    </div>
  )
}
