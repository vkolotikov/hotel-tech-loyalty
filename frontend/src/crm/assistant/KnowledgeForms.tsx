import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Select, TextArea, TextInput, Toggle } from '../ui/inputs'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import {
  KNOWLEDGE_LIMITS, categoryForm, categoryPayload, categoryValid, importPayload, itemForm, itemPayload, itemProblems,
  pickedDrafts, reviewDrafts, sourceUsable, type CategoryForm, type ItemForm, type ReviewDraft,
} from './knowledge'
import { mergeTexts } from './lists'
import { AiButton, CharCount, ChipEditor, Problem } from './parts'
import { knowledgeChanged } from './queries'
import type { DraftFaq, KnowledgeCategory, KnowledgeItem } from './types'

/** An answer, new or edited: its question, answer, category, keywords (the AI can suggest some), priority and use. */
export function ItemPanel({ item, categories, onClose }: { item: KnowledgeItem | null; categories: KnowledgeCategory[]; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [form, setForm] = useState<ItemForm>(() => itemForm(item))
  const [tried, setTried] = useState(false)
  const problems = itemProblems(form)
  const set = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) => setForm(f => ({ ...f, [key]: value }))

  const save = useMutation({
    mutationFn: () => item
      ? send<KnowledgeItem>('put', `knowledge/items/${item.id}`, itemPayload(form))
      : send<KnowledgeItem>('post', 'knowledge/items', itemPayload(form)),
    onSuccess: () => { knowledgeChanged(qc); say(t('crm.common.saved', 'Saved')); onClose() },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const suggest = useMutation({
    mutationFn: () => send<{ keywords?: string[] }>('post', 'chatbot-config/suggest-keywords', { question: form.question.trim(), answer: form.answer.trim() }),
    onSuccess: data => {
      const fresh = Array.isArray(data.keywords) ? data.keywords : []
      if (fresh.length === 0) say(t('crm.assistant.knowledge.no_keywords', 'The AI had no keywords to suggest.'))
      setForm(f => ({ ...f, keywords: mergeTexts(f.keywords, fresh, KNOWLEDGE_LIMITS.keyword) }))
    },
  })

  const submit = () => {
    setTried(true)
    if (problems.length === 0) save.mutate()
  }

  return (
    <SidePanel title={item ? t('crm.assistant.knowledge.edit_title', 'Edit the answer') : t('crm.assistant.knowledge.new_title', 'New answer')} onClose={onClose}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button onClick={submit} loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
        </div>
      )}>
      <div className="space-y-4">
        <div>
          <Field label={t('crm.assistant.knowledge.question', 'Question')}>
            <TextInput value={form.question} placeholder={t('crm.assistant.knowledge.question_placeholder', 'e.g. What time is check-in?')} onChange={e => set('question', e.target.value)} />
          </Field>
          {tried && problems.includes('question_required') && <Problem>{t('crm.assistant.knowledge.question_required', 'Write the question a visitor would ask.')}</Problem>}
          {problems.includes('question_long') && <Problem>{t('crm.assistant.too_long', 'Too long: at most {{max}} characters.', { max: KNOWLEDGE_LIMITS.question })}</Problem>}
        </div>
        <div>
          <Field label={t('crm.assistant.knowledge.answer', 'Answer')}>
            <TextArea rows={6} value={form.answer} onChange={e => set('answer', e.target.value)} />
          </Field>
          <CharCount value={form.answer} max={KNOWLEDGE_LIMITS.answer} />
          {tried && problems.includes('answer_required') && <Problem>{t('crm.assistant.knowledge.answer_required', 'Write the answer the assistant should give.')}</Problem>}
          {problems.includes('answer_long') && <Problem>{t('crm.assistant.too_long', 'Too long: at most {{max}} characters.', { max: KNOWLEDGE_LIMITS.answer })}</Problem>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('crm.assistant.knowledge.category', 'Category')}>
            <Select value={form.category_id ?? ''} onChange={e => set('category_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('crm.assistant.knowledge.no_category', 'No category')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label={t('crm.assistant.knowledge.priority', 'Priority')} hint={t('crm.assistant.knowledge.priority_hint', 'Higher wins when two answers fit.')}>
            <TextInput type="number" min={0} inputMode="numeric" value={form.priority} onChange={e => set('priority', e.target.value)} />
          </Field>
        </div>
        <ChipEditor label={t('crm.assistant.knowledge.keywords', 'Keywords')} items={form.keywords} max={KNOWLEDGE_LIMITS.keyword}
          placeholder={t('crm.assistant.knowledge.keyword_placeholder', 'A word visitors use')} onChange={next => set('keywords', next)}
          extra={(
            <AiButton size="sm" onClick={() => suggest.mutate()} disabled={!form.question.trim() || suggest.isPending}>
              <Sparkles size={14} aria-hidden />{suggest.isPending ? t('crm.assistant.knowledge.suggesting', 'Suggesting…') : t('crm.assistant.knowledge.suggest', 'Suggest')}
            </AiButton>
          )} />
        {suggest.isError && <Notice tone="danger">{errorText(t, suggest.error)}</Notice>}
        <Toggle label={t('crm.assistant.knowledge.active', 'The assistant uses this answer')} checked={form.is_active} onChange={on => set('is_active', on)} />
      </div>
    </SidePanel>
  )
}

/** A category: its name, a line on what goes in it, its priority and whether its answers are used. */
export function CategoryDialog({ category, onClose }: { category: KnowledgeCategory | null; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [form, setForm] = useState<CategoryForm>(() => categoryForm(category))
  const set = <K extends keyof CategoryForm>(key: K, value: CategoryForm[K]) => setForm(f => ({ ...f, [key]: value }))
  const save = useMutation({
    mutationFn: () => category
      ? send('put', `knowledge/categories/${category.id}`, categoryPayload(form))
      : send('post', 'knowledge/categories', categoryPayload(form)),
    onSuccess: () => { knowledgeChanged(qc); say(t('crm.common.saved', 'Saved')); onClose() },
    onError: error => say(errorText(t, error), 'danger'),
  })
  return (
    <Dialog title={category ? t('crm.assistant.knowledge.edit_category_title', 'Edit the category') : t('crm.assistant.knowledge.new_category', 'New category')} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (categoryValid(form)) save.mutate() }}>
        <Field label={t('crm.assistant.knowledge.category_name', 'Name')}>
          <TextInput value={form.name} maxLength={KNOWLEDGE_LIMITS.category} onChange={e => set('name', e.target.value)} />
        </Field>
        <Field label={t('crm.assistant.knowledge.category_description', 'What goes in it')}>
          <TextArea rows={2} value={form.description} maxLength={KNOWLEDGE_LIMITS.description} onChange={e => set('description', e.target.value)} />
        </Field>
        <Field label={t('crm.assistant.knowledge.priority', 'Priority')}>
          <TextInput type="number" min={0} inputMode="numeric" value={form.priority} onChange={e => set('priority', e.target.value)} />
        </Field>
        <Toggle label={t('crm.assistant.knowledge.category_active', 'The assistant uses its answers')} checked={form.is_active} onChange={on => set('is_active', on)} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" loading={save.isPending} disabled={!categoryValid(form)}>{t('crm.common.save', 'Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * Draft answers from a text (knowledge/extract-faqs): paste a brochure, a price list or a policy; the AI drafts
 * questions and answers; the manager edits, unticks what does not fit, and adds the rest (knowledge/bulk-import-faqs).
 * Nothing is added before that.
 */
export function ExtractPanel({ categories, onClose }: { categories: KnowledgeCategory[]; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [source, setSource] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<ReviewDraft[] | null>(null)
  const picked = drafts ? pickedDrafts(drafts) : []
  const edit = (i: number, patch: Partial<ReviewDraft>) => setDrafts(list => (list ?? []).map((d, j) => (j === i ? { ...d, ...patch } : d)))

  const extract = useMutation({
    mutationFn: () => send<{ items?: DraftFaq[] }>('post', 'knowledge/extract-faqs', { source_text: source.trim() }),
    onSuccess: data => setDrafts(reviewDrafts(data.items)),
  })
  const add = useMutation({
    mutationFn: () => send<{ created_count: number }>('post', 'knowledge/bulk-import-faqs', importPayload(drafts ?? [], categoryId)),
    onSuccess: data => {
      knowledgeChanged(qc)
      say(t('crm.assistant.knowledge.imported', '{{count}} answers added.', { count: data.created_count }))
      onClose()
    },
    onError: error => say(errorText(t, error), 'danger'),
  })

  return (
    <SidePanel title={t('crm.assistant.knowledge.extract_title', 'Draft answers from a text')} onClose={onClose}
      footer={drafts && drafts.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => setDrafts(null)} disabled={add.isPending}>{t('crm.assistant.knowledge.start_over', 'Start over')}</Button>
          <Button onClick={() => add.mutate()} loading={add.isPending} disabled={picked.length === 0}>{t('crm.assistant.knowledge.add_picked', 'Add {{count}} answers', { count: picked.length })}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={extract.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <AiButton fill onClick={() => extract.mutate()} disabled={!sourceUsable(source) || extract.isPending}>
            <Sparkles size={15} aria-hidden />{extract.isPending ? t('crm.assistant.knowledge.drafting', 'Drafting…') : t('crm.assistant.knowledge.draft', 'Draft answers')}
          </AiButton>
        </div>
      )}>
      {drafts === null ? (
        <div className="space-y-4">
          <p className="text-sm text-a-text-2">{t('crm.assistant.knowledge.extract_line', 'Paste your brochure, price list or house rules. The AI drafts questions and answers from it; you check them before anything is added.')}</p>
          {extract.isError && <Notice tone="danger">{errorText(t, extract.error)}</Notice>}
          <div>
            <Field label={t('crm.assistant.knowledge.source', 'Your text')}>
              <TextArea rows={12} value={source} maxLength={KNOWLEDGE_LIMITS.sourceMax} onChange={e => setSource(e.target.value)} />
            </Field>
            <span className="mt-1 block text-xs text-a-text-2">{t('crm.assistant.knowledge.source_hint', 'At least {{min}} characters. {{count}} so far.', { min: KNOWLEDGE_LIMITS.sourceMin, count: source.trim().length })}</span>
          </div>
          <Field label={t('crm.assistant.knowledge.save_into', 'Add them to')}>
            <Select value={categoryId ?? ''} onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('crm.assistant.knowledge.ai_category', 'A new category, "AI Generated"')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
      ) : drafts.length === 0 ? (
        <Notice tone="warning">{t('crm.assistant.knowledge.no_drafts', 'The AI found nothing to draft. Try a longer text with facts in it.')}</Notice>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-a-text-2">{t('crm.assistant.knowledge.review_line', '{{picked}} of {{total}} ticked. Edit anything before adding.', { picked: picked.length, total: drafts.length })}</p>
            <Button variant="ghost" size="sm" onClick={() => setDrafts(list => (list ?? []).map(d => ({ ...d, picked: true })))}>{t('crm.assistant.knowledge.tick_all', 'Tick all')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setDrafts(list => (list ?? []).map(d => ({ ...d, picked: false })))}>{t('crm.assistant.knowledge.tick_none', 'Untick all')}</Button>
          </div>
          <ul className="space-y-2">
            {drafts.map((draft, i) => (
              <li key={i} className={`rounded-xl border p-3 ${draft.picked ? 'border-a-accent/40 bg-a-surface' : 'border-a-border bg-a-surface-2'}`}>
                <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-medium text-a-text-2">
                  <input type="checkbox" className="h-4 w-4 accent-a-accent-text" checked={draft.picked} onChange={e => edit(i, { picked: e.target.checked })} />
                  {t('crm.assistant.knowledge.add_this', 'Add this answer')}
                </label>
                <label className="block">
                  <span className="sr-only">{t('crm.assistant.knowledge.question', 'Question')}</span>
                  <TextInput value={draft.question} maxLength={KNOWLEDGE_LIMITS.question} onChange={e => edit(i, { question: e.target.value })} />
                </label>
                <label className="mt-2 block">
                  <span className="sr-only">{t('crm.assistant.knowledge.answer', 'Answer')}</span>
                  <TextArea rows={3} value={draft.answer} maxLength={KNOWLEDGE_LIMITS.answer} onChange={e => edit(i, { answer: e.target.value })} />
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SidePanel>
  )
}
