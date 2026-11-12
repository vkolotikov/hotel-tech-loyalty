import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookOpen, FileText, FolderOpen, ListFilter, Pencil, Plus, Sparkles, Tag, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { get, send } from '../lib/api'
import { count } from '../lib/format'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { SearchInput, Select } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import { DocumentsCard } from './KnowledgeDocuments'
import { CategoryDialog, ExtractPanel, ItemPanel } from './KnowledgeForms'
import { activeFilters, categoryFilterOf, filterItems, itemCounts, type CategoryFilter } from './knowledge'
import { SectionedForm, type FormPart } from '../settings/formKit'
import type { KnowledgePart } from './lists'
import { AiButton, IconButton, ReadOnlyNote } from './parts'
import { KNOWLEDGE_KEY, knowledgeChanged } from './queries'
import type { KnowledgeCategory, KnowledgeDocument, KnowledgeItem } from './types'

/**
 * What the assistant answers from (knowledge/*): the answers with a toolbar (search, category, add, draft from a text),
 * then the categories and the documents, each in its own card. A manager adds, edits and deletes; the AI drafts
 * answers from pasted text, reviewed before they are added. A category's row shows its answers in the list above.
 */
export function KnowledgeTab({ canManage, part, onPart }: { canManage: boolean; part: KnowledgePart; onPart: (next: KnowledgePart) => void }) {
  const { t } = useTranslation()
  const items = useQuery({ queryKey: [...KNOWLEDGE_KEY, 'items'], queryFn: () => get<KnowledgeItem[]>('knowledge/items') })
  const categories = useQuery({ queryKey: [...KNOWLEDGE_KEY, 'categories'], queryFn: () => get<KnowledgeCategory[]>('knowledge/categories') })
  const documents = useQuery({ queryKey: [...KNOWLEDGE_KEY, 'documents'], queryFn: () => get<KnowledgeDocument[]>('knowledge/documents') })
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>(null)

  const showCategory = (id: number) => {
    setCategory(id)
    setSearch('')
    onPart('answers')
  }
  const parts: FormPart<KnowledgePart>[] = [
    { key: 'answers', icon: BookOpen, tone: 'accent', title: t('crm.assistant.knowledge.answers', 'Answers'), badge: items.data?.length },
    { key: 'categories', icon: FolderOpen, tone: 'pending', title: t('crm.assistant.knowledge.categories', 'Categories'), badge: categories.data?.length },
    { key: 'documents', icon: FileText, tone: 'progress', title: t('crm.assistant.knowledge.documents', 'Documents'), badge: documents.data?.length },
  ]

  return (
    <div className="space-y-4">
      {!canManage && <ReadOnlyNote />}
      <SectionedForm label={t('crm.assistant.knowledge.parts', 'Parts of the knowledge')} idPrefix="assistant-knowledge" parts={parts} value={part} onChange={onPart} next={false}>
        {part === 'answers' && (
          <QueryState loading={items.isLoading} error={items.error} onRetry={() => { void items.refetch() }}>
            <AnswersSection items={items.data ?? []} categories={categories.data ?? []} canManage={canManage}
              search={search} setSearch={setSearch} category={category} setCategory={setCategory} />
          </QueryState>
        )}
        {part === 'categories' && (
          <QueryState loading={categories.isLoading} error={categories.error} onRetry={() => { void categories.refetch() }} rows={3}>
            <CategoriesCard categories={categories.data ?? []} canManage={canManage} onShow={showCategory} />
          </QueryState>
        )}
        {part === 'documents' && (
          <QueryState loading={documents.isLoading} error={documents.error} onRetry={() => { void documents.refetch() }} rows={3}>
            <DocumentsCard documents={documents.data ?? []} canManage={canManage} />
          </QueryState>
        )}
      </SectionedForm>
    </div>
  )
}

function AnswersSection({ items, categories, canManage, search, setSearch, category, setCategory }: {
  items: KnowledgeItem[]
  categories: KnowledgeCategory[]
  canManage: boolean
  search: string
  setSearch: (v: string) => void
  category: CategoryFilter
  setCategory: (v: CategoryFilter) => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [editing, setEditing] = useState<KnowledgeItem | 'new' | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [deleting, setDeleting] = useState<KnowledgeItem | null>(null)
  const shown = useMemo(() => filterItems(items, search, category), [items, search, category])
  const filters = activeFilters(search, category, categories)
  const counts = itemCounts(items)
  const lang = i18n.language

  const remove = useMutation({
    mutationFn: (item: KnowledgeItem) => send('delete', `knowledge/items/${item.id}`),
    onSuccess: () => { knowledgeChanged(qc); setDeleting(null); say(t('crm.assistant.knowledge.deleted', 'Deleted')) },
    onError: error => say(errorText(t, error), 'danger'),
  })

  const addButton = <Button onClick={() => setEditing('new')}><Plus size={15} aria-hidden />{t('crm.assistant.knowledge.add', 'Add an answer')}</Button>
  const draftButton = <AiButton onClick={() => setExtracting(true)}><Sparkles size={15} aria-hidden />{t('crm.assistant.knowledge.extract', 'Draft from a text')}</AiButton>
  const clear = () => { setSearch(''); setCategory(null) }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <Toolbar
          actions={canManage ? <>{draftButton}{addButton}</> : undefined}
          chips={filters.length > 0 ? (
            <>
              {filters.map(f => (
                <FilterChip key={f.key} removeLabel={t('crm.assistant.knowledge.remove_filter', 'Remove the filter')}
                  label={f.key === 'search'
                    ? t('crm.assistant.knowledge.chip_search', 'Search: {{value}}', { value: f.value })
                    : f.value ? t('crm.assistant.knowledge.chip_category', 'Category: {{value}}', { value: f.value }) : t('crm.assistant.knowledge.no_category', 'No category')}
                  onRemove={() => (f.key === 'search' ? setSearch('') : setCategory(null))} />
              ))}
              <button type="button" onClick={clear} className="rounded-full px-2 py-0.5 text-xs font-medium text-a-accent-text hover:underline">{t('crm.assistant.knowledge.clear', 'Clear all')}</button>
            </>
          ) : undefined}>
          <SearchInput className="min-w-0 sm:flex-1 sm:basis-56" label={t('crm.assistant.knowledge.search', 'Search questions and answers')} value={search} onChange={setSearch} />
          <label className="relative block sm:w-56">
            <span className="sr-only">{t('crm.assistant.knowledge.category_filter', 'Category')}</span>
            <ListFilter size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-a-text-2" />
            <Select className="pl-9" value={category === null ? '' : String(category)} onChange={e => setCategory(categoryFilterOf(e.target.value))}>
              <option value="">{t('crm.assistant.knowledge.all_categories', 'All categories')}</option>
              <option value="none">{t('crm.assistant.knowledge.no_category', 'No category')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
        </Toolbar>
      )}

      <Card padded={false} title={t('crm.assistant.knowledge.answers', 'Answers')} icon={BookOpen} tone="accent"
        description={items.length > 0 ? t('crm.assistant.knowledge.answers_line', '{{active}} of {{total}} in use', { active: count(counts.active, lang), total: count(counts.total, lang) }) : undefined}>
        {items.length === 0 ? (
          <EmptyState icon={BookOpen} title={t('crm.assistant.knowledge.empty', 'No answers yet')}
            line={t('crm.assistant.knowledge.empty_line', 'Add the questions visitors ask most, with your answers: prices, hours, how to book.')}
            action={canManage ? <div className="flex flex-wrap justify-center gap-2">{addButton}{draftButton}</div> : undefined} />
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <p className="text-sm text-a-text-2">{t('crm.assistant.knowledge.no_match', 'No answer matches this search.')}</p>
            <Button variant="ghost" size="sm" onClick={clear}>{t('crm.assistant.knowledge.clear', 'Clear all')}</Button>
          </div>
        ) : (
          <div role="table" aria-label={t('crm.assistant.knowledge.answers', 'Answers')}>
            <div role="row" className="hidden border-b border-a-border px-4 py-2 text-xs font-medium text-a-text-2 md:grid md:grid-cols-[minmax(0,1fr)_10rem_5rem_5.5rem] md:gap-4">
              <span role="columnheader">{t('crm.assistant.knowledge.col_answer', 'Question and answer')}</span>
              <span role="columnheader">{t('crm.assistant.knowledge.category', 'Category')}</span>
              <span role="columnheader" className="text-right">{t('crm.assistant.knowledge.col_used', 'Used')}</span>
              <span role="columnheader" className="sr-only">{t('crm.assistant.knowledge.col_actions', 'Actions')}</span>
            </div>
            <div className="divide-y divide-a-border">
              {shown.map(item => (
                <div role="row" key={item.id} className="group flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 transition-colors hover:bg-a-surface-2/60 md:grid md:grid-cols-[minmax(0,1fr)_10rem_5rem_5.5rem] md:gap-4">
                  <div role="cell" className="min-w-0 basis-full md:basis-auto">
                    {canManage ? (
                      <button type="button" onClick={() => setEditing(item)} className="block max-w-full rounded-sm text-left text-sm font-medium text-a-text hover:text-a-accent-text focus-visible:outline-2 focus-visible:outline-a-accent">
                        {item.question}
                      </button>
                    ) : <p className="text-sm font-medium text-a-text">{item.question}</p>}
                    <p className="mt-0.5 flex min-w-0 items-center gap-2 text-sm text-a-text-2">
                      {!item.is_active && <Pill tone="danger">{t('crm.assistant.knowledge.off', 'Not used')}</Pill>}
                      <span className="min-w-0 flex-1 truncate">{item.answer}</span>
                      {(item.keywords ?? []).length > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs" title={(item.keywords ?? []).join(' · ')}>
                          <Tag size={12} aria-hidden /><span className="sr-only">{t('crm.assistant.knowledge.keywords_count', 'Keywords:')}</span>{(item.keywords ?? []).length}
                        </span>
                      )}
                    </p>
                  </div>
                  <div role="cell" className="flex min-w-0 flex-1 items-center gap-2 md:block">
                    {item.category
                      ? <Pill>{item.category.name}</Pill>
                      : <span className="text-xs text-a-text-2">{t('crm.assistant.knowledge.no_category', 'No category')}</span>}
                    <span className="ml-auto text-xs text-a-text-2 md:hidden">{t('crm.assistant.knowledge.used', 'Used {{count}} times', { count: item.use_count })}</span>
                  </div>
                  <div role="cell" className="hidden text-right text-sm tabular-nums text-a-text md:block">
                    <span className="sr-only">{t('crm.assistant.knowledge.used', 'Used {{count}} times', { count: item.use_count })}</span>
                    <span aria-hidden>{count(item.use_count, lang)}</span>
                  </div>
                  <div role="cell" className="flex shrink-0 justify-end gap-0.5">
                    {canManage && (
                      <>
                        <IconButton icon={Pencil} label={t('crm.assistant.knowledge.edit_answer', 'Edit "{{question}}"', { question: item.question })} onClick={() => setEditing(item)} />
                        <IconButton icon={Trash2} danger label={t('crm.assistant.knowledge.delete_answer', 'Delete "{{question}}"', { question: item.question })} onClick={() => setDeleting(item)} />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
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

function CategoriesCard({ categories, canManage, onShow }: { categories: KnowledgeCategory[]; canManage: boolean; onShow: (id: number) => void }) {
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
    <Card padded={false} title={t('crm.assistant.knowledge.categories', 'Categories')} icon={FolderOpen} tone="neutral"
      description={t('crm.assistant.knowledge.categories_line', 'Tap one to see its answers.')}
      action={canManage ? <Button variant="secondary" size="sm" onClick={() => setEditing('new')}><Plus size={14} aria-hidden />{t('crm.common.add', 'Add')}</Button> : undefined}>
      {categories.length === 0 ? (
        <EmptyState icon={FolderOpen} title={t('crm.assistant.knowledge.no_categories', 'No categories yet')}
          line={t('crm.assistant.knowledge.no_categories_line', 'Group answers, e.g. "Prices", "Getting here", "Policies".')}
          action={canManage ? <Button size="sm" onClick={() => setEditing('new')}><Plus size={14} aria-hidden />{t('crm.assistant.knowledge.add_category', 'Add a category')}</Button> : undefined} />
      ) : (
        <ul className="divide-y divide-a-border">
          {categories.map(category => (
            <li key={category.id} className="group flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-a-surface-2/60">
              <button type="button" onClick={() => onShow(category.id)} className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-a-accent"
                aria-label={t('crm.assistant.knowledge.show_category', 'Show the answers in {{name}}', { name: category.name })}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-a-text">{category.name}</span>
                  {!category.is_active && <Pill tone="danger">{t('crm.assistant.knowledge.off', 'Not used')}</Pill>}
                </span>
                {category.description && <span className="block truncate text-xs text-a-text-2">{category.description}</span>}
              </button>
              <span className="shrink-0 text-xs tabular-nums text-a-text-2">{t('crm.assistant.knowledge.answers_count', '{{count}} answers', { count: category.items_count ?? 0 })}</span>
              {canManage && (
                <span className="flex shrink-0">
                  <IconButton icon={Pencil} label={t('crm.assistant.knowledge.edit_category', 'Edit {{name}}', { name: category.name })} onClick={() => setEditing(category)} />
                  <IconButton icon={Trash2} danger label={t('crm.assistant.knowledge.delete_category', 'Delete {{name}}', { name: category.name })} onClick={() => setDeleting(category)} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <CategoryDialog category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <Confirm title={t('crm.assistant.knowledge.delete_category_title', 'Delete the category {{name}}?', { name: deleting.name })} confirm={t('crm.common.delete', 'Delete')}
          busy={remove.isPending} onConfirm={() => remove.mutate(deleting)} onClose={() => setDeleting(null)}>
          {t('crm.assistant.knowledge.delete_category_line', 'Its {{count}} answers stay, without a category.', { count: deleting.items_count ?? 0 })}
        </Confirm>
      )}
    </Card>
  )
}
