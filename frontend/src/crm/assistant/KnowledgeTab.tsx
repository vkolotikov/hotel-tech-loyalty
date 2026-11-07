import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookOpen, FolderOpen, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { SearchInput, Select } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { DocumentsSection } from './KnowledgeDocuments'
import { CategoryDialog, ExtractPanel, ItemPanel } from './KnowledgeForms'
import { filterItems } from './knowledge'
import { ReadOnlyNote } from './parts'
import { KNOWLEDGE_KEY, knowledgeChanged } from './queries'
import type { KnowledgeCategory, KnowledgeDocument, KnowledgeItem } from './types'

type Section = 'answers' | 'categories' | 'documents'

/**
 * What the assistant answers from (knowledge/*): questions and answers, their categories, and documents it reads.
 * A manager adds, edits and deletes; the AI can draft answers from pasted text, reviewed before they are added.
 */
export function KnowledgeTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>('answers')
  const items = useQuery({ queryKey: [...KNOWLEDGE_KEY, 'items'], queryFn: () => get<KnowledgeItem[]>('knowledge/items') })
  const categories = useQuery({ queryKey: [...KNOWLEDGE_KEY, 'categories'], queryFn: () => get<KnowledgeCategory[]>('knowledge/categories') })
  const documents = useQuery({ queryKey: [...KNOWLEDGE_KEY, 'documents'], queryFn: () => get<KnowledgeDocument[]>('knowledge/documents') })

  return (
    <div className="space-y-4">
      {!canManage && <ReadOnlyNote />}
      <Tabs label={t('crm.assistant.knowledge.sections', 'Knowledge')} value={section} onChange={setSection} items={[
        { key: 'answers', label: t('crm.assistant.knowledge.answers', 'Answers'), count: items.data?.length },
        { key: 'categories', label: t('crm.assistant.knowledge.categories', 'Categories'), count: categories.data?.length },
        { key: 'documents', label: t('crm.assistant.knowledge.documents', 'Documents'), count: documents.data?.length },
      ]} />
      {section === 'answers' && (
        <QueryState loading={items.isLoading} error={items.error} onRetry={() => { void items.refetch() }}>
          <AnswersSection items={items.data ?? []} categories={categories.data ?? []} canManage={canManage} />
        </QueryState>
      )}
      {section === 'categories' && (
        <QueryState loading={categories.isLoading} error={categories.error} onRetry={() => { void categories.refetch() }}>
          <CategoriesSection categories={categories.data ?? []} canManage={canManage} />
        </QueryState>
      )}
      {section === 'documents' && (
        <QueryState loading={documents.isLoading} error={documents.error} onRetry={() => { void documents.refetch() }}>
          <DocumentsSection documents={documents.data ?? []} canManage={canManage} />
        </QueryState>
      )}
    </div>
  )
}

function AnswersSection({ items, categories, canManage }: { items: KnowledgeItem[]; categories: KnowledgeCategory[]; canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('')
  const [editing, setEditing] = useState<KnowledgeItem | 'new' | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [deleting, setDeleting] = useState<KnowledgeItem | null>(null)
  const categoryFilter = category === '' ? null : category === 'none' ? 'none' : Number(category)
  const shown = useMemo(() => filterItems(items, search, categoryFilter), [items, search, categoryFilter])

  const remove = useMutation({
    mutationFn: (item: KnowledgeItem) => send('delete', `knowledge/items/${item.id}`),
    onSuccess: () => { knowledgeChanged(qc); setDeleting(null); say(t('crm.assistant.knowledge.deleted', 'Deleted')) },
    onError: error => say(errorText(t, error), 'danger'),
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput className="min-w-0 flex-1 basis-56" label={t('crm.assistant.knowledge.search', 'Search questions and answers')} value={search} onChange={setSearch} />
        <label className="basis-48">
          <span className="sr-only">{t('crm.assistant.knowledge.category_filter', 'Category')}</span>
          <Select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">{t('crm.assistant.knowledge.all_categories', 'All categories')}</option>
            <option value="none">{t('crm.assistant.knowledge.no_category', 'No category')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        {canManage && (
          <>
            <button type="button" onClick={() => setExtracting(true)}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold crm-ai-soft focus-visible:outline-2 focus-visible:outline-a-accent">
              <Sparkles size={15} aria-hidden />{t('crm.assistant.knowledge.extract', 'Draft from a text')}
            </button>
            <Button onClick={() => setEditing('new')}><Plus size={15} aria-hidden />{t('crm.assistant.knowledge.add', 'Add an answer')}</Button>
          </>
        )}
      </div>

      <Card padded={false}>
        {items.length === 0 ? (
          <EmptyState icon={BookOpen} title={t('crm.assistant.knowledge.empty', 'No answers yet')}
            line={t('crm.assistant.knowledge.empty_line', 'Add the questions visitors ask most, with your answers: prices, hours, how to book.')}
            action={canManage ? <Button onClick={() => setEditing('new')}><Plus size={15} aria-hidden />{t('crm.assistant.knowledge.add', 'Add an answer')}</Button> : undefined} />
        ) : shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-a-text-2">{t('crm.assistant.knowledge.no_match', 'No answer matches this search.')}</p>
        ) : (
          <ul className="divide-y divide-a-border">
            {shown.map(item => (
              <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-a-text">{item.question}</p>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-a-text-2">{item.answer}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {item.category && <Pill>{item.category.name}</Pill>}
                    {!item.is_active && <Pill tone="danger">{t('crm.assistant.knowledge.off', 'Not used')}</Pill>}
                    {(item.keywords ?? []).slice(0, 6).map(k => <Pill key={k} tone="accent">{k}</Pill>)}
                    <span className="text-xs text-a-text-2">{t('crm.assistant.knowledge.used', 'Used {{count}} times', { count: item.use_count })}</span>
                  </div>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing(item)} aria-label={t('crm.assistant.knowledge.edit_answer', 'Edit "{{question}}"', { question: item.question })}
                      className="rounded-full p-2 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent"><Pencil size={15} aria-hidden /></button>
                    <button type="button" onClick={() => setDeleting(item)} aria-label={t('crm.assistant.knowledge.delete_answer', 'Delete "{{question}}"', { question: item.question })}
                      className="rounded-full p-2 text-a-text-2 hover:bg-a-surface-2 hover:text-a-danger focus-visible:outline-2 focus-visible:outline-a-accent"><Trash2 size={15} aria-hidden /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && <ItemPanel item={editing === 'new' ? null : editing} categories={categories} onClose={() => setEditing(null)} />}
      {extracting && <ExtractPanel categories={categories} onClose={() => setExtracting(false)} />}
      {deleting && (
        <Confirm title={t('crm.assistant.knowledge.delete_title', 'Delete this answer?')} confirm={t('crm.common.delete', 'Delete')} busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting)} onClose={() => setDeleting(null)}>
          {t('crm.assistant.knowledge.delete_line', 'The assistant stops using "{{question}}". This cannot be undone.', { question: deleting.question })}
        </Confirm>
      )}
    </div>
  )
}

function CategoriesSection({ categories, canManage }: { categories: KnowledgeCategory[]; canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [editing, setEditing] = useState<KnowledgeCategory | 'new' | null>(null)
  const [deleting, setDeleting] = useState<KnowledgeCategory | null>(null)
  const remove = useMutation({
    mutationFn: (category: KnowledgeCategory) => send('delete', `knowledge/categories/${category.id}`),
    onSuccess: () => { knowledgeChanged(qc); setDeleting(null); say(t('crm.assistant.knowledge.deleted', 'Deleted')) },
    onError: error => say(errorText(t, error), 'danger'),
  })

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}><Plus size={15} aria-hidden />{t('crm.assistant.knowledge.add_category', 'Add a category')}</Button>
        </div>
      )}
      <Card padded={false}>
        {categories.length === 0 ? (
          <EmptyState icon={FolderOpen} title={t('crm.assistant.knowledge.no_categories', 'No categories yet')}
            line={t('crm.assistant.knowledge.no_categories_line', 'Group answers, e.g. "Prices", "Getting here", "Policies".')} />
        ) : (
          <ul className="divide-y divide-a-border">
            {categories.map(category => (
              <li key={category.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-a-text">
                    {category.name}
                    <span className="text-xs font-normal text-a-text-2">{t('crm.assistant.knowledge.answers_count', '{{count}} answers', { count: category.items_count ?? 0 })}</span>
                    {!category.is_active && <Pill tone="danger">{t('crm.assistant.knowledge.off', 'Not used')}</Pill>}
                  </p>
                  {category.description && <p className="mt-0.5 text-sm text-a-text-2">{category.description}</p>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing(category)} aria-label={t('crm.assistant.knowledge.edit_category', 'Edit {{name}}', { name: category.name })}
                      className="rounded-full p-2 text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent"><Pencil size={15} aria-hidden /></button>
                    <button type="button" onClick={() => setDeleting(category)} aria-label={t('crm.assistant.knowledge.delete_category', 'Delete {{name}}', { name: category.name })}
                      className="rounded-full p-2 text-a-text-2 hover:bg-a-surface-2 hover:text-a-danger focus-visible:outline-2 focus-visible:outline-a-accent"><Trash2 size={15} aria-hidden /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <CategoryDialog category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <Confirm title={t('crm.assistant.knowledge.delete_category_title', 'Delete the category {{name}}?', { name: deleting.name })} confirm={t('crm.common.delete', 'Delete')}
          busy={remove.isPending} onConfirm={() => remove.mutate(deleting)} onClose={() => setDeleting(null)}>
          {t('crm.assistant.knowledge.delete_category_line', 'Its {{count}} answers stay, without a category.', { count: deleting.items_count ?? 0 })}
        </Confirm>
      )}
    </div>
  )
}
