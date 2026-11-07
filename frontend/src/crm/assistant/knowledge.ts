import type { Tone as PillTone } from '../ui/StatTile'
import { orNull, wholeNumber } from './lists'
import type { DocumentStatus, DraftFaq, KnowledgeCategory, KnowledgeItem } from './types'

/**
 * The knowledge the assistant answers from (KnowledgeBaseController): the answers' filter, the forms of an answer and
 * a category, the documents' states, and the AI's drafts from pasted text. Lengths are the controller's. Pure.
 */
export const KNOWLEDGE_LIMITS = {
  question: 500,
  answer: 5000,
  keyword: 50,
  category: 120,
  description: 1000,
  sourceMin: 50,
  sourceMax: 20000,
  importMax: 50,
  fileBytes: 10 * 1024 * 1024,
} as const

export const DOCUMENT_TYPES = ['pdf', 'doc', 'docx', 'txt'] as const

/** The answers a search and a category leave, in the server's order (priority, then use). */
export function filterItems(items: readonly KnowledgeItem[], search: string, categoryId: number | 'none' | null): KnowledgeItem[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(item => {
    if (categoryId === 'none' && item.category_id !== null) return false
    if (typeof categoryId === 'number' && item.category_id !== categoryId) return false
    if (words.length === 0) return true
    const text = `${item.question} ${item.answer} ${(item.keywords ?? []).join(' ')}`.toLowerCase()
    return words.every(word => text.includes(word))
  })
}

export interface ItemForm {
  question: string
  answer: string
  category_id: number | null
  keywords: string[]
  priority: string
  is_active: boolean
}

export function itemForm(item?: KnowledgeItem | null): ItemForm {
  return {
    question: item?.question ?? '',
    answer: item?.answer ?? '',
    category_id: item?.category_id ?? null,
    keywords: item?.keywords ?? [],
    priority: String(item?.priority ?? 0),
    is_active: item?.is_active ?? true,
  }
}

export type ItemProblem = 'question_required' | 'question_long' | 'answer_required' | 'answer_long'

export function itemProblems(form: ItemForm): ItemProblem[] {
  const out: ItemProblem[] = []
  if (!form.question.trim()) out.push('question_required')
  else if (form.question.trim().length > KNOWLEDGE_LIMITS.question) out.push('question_long')
  if (!form.answer.trim()) out.push('answer_required')
  else if (form.answer.trim().length > KNOWLEDGE_LIMITS.answer) out.push('answer_long')
  return out
}

/** The body of POST/PUT knowledge/items. */
export function itemPayload(form: ItemForm): Record<string, unknown> {
  return {
    question: form.question.trim(),
    answer: form.answer.trim(),
    category_id: form.category_id,
    keywords: form.keywords.map(k => k.trim().slice(0, KNOWLEDGE_LIMITS.keyword)).filter(Boolean),
    priority: wholeNumber(form.priority, 0, 1_000_000, 0),
    is_active: form.is_active,
  }
}

export interface CategoryForm { name: string; description: string; priority: string; is_active: boolean }

export function categoryForm(category?: KnowledgeCategory | null): CategoryForm {
  return {
    name: category?.name ?? '',
    description: category?.description ?? '',
    priority: String(category?.priority ?? 0),
    is_active: category?.is_active ?? true,
  }
}

export function categoryValid(form: CategoryForm): boolean {
  const name = form.name.trim()
  return name.length > 0 && name.length <= KNOWLEDGE_LIMITS.category && form.description.trim().length <= KNOWLEDGE_LIMITS.description
}

export function categoryPayload(form: CategoryForm): Record<string, unknown> {
  return {
    name: form.name.trim(),
    description: orNull(form.description),
    priority: wholeNumber(form.priority, 0, 1_000_000, 0),
    is_active: form.is_active,
  }
}

/** A document's state as a pill's tone. */
export const DOCUMENT_TONE: Record<DocumentStatus, PillTone> = {
  pending: 'pending',
  processing: 'progress',
  completed: 'success',
  failed: 'danger',
}

/** Why a chosen file would be refused before it is sent: its type or its size (10 MB). */
export function fileProblem(file: { name: string; size: number }): 'type' | 'size' | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!(DOCUMENT_TYPES as readonly string[]).includes(ext)) return 'type'
  if (file.size > KNOWLEDGE_LIMITS.fileBytes) return 'size'
  return null
}

/** A file's size in the person's language: "820 KB", "2.4 MB". */
export function fileSize(bytes: number | null | undefined, lang: string): string {
  if (!bytes || bytes <= 0) return ''
  const units = ['byte', 'kilobyte', 'megabyte'] as const
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  try {
    return new Intl.NumberFormat(lang, { style: 'unit', unit: units[unit], unitDisplay: 'short', maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)
  } catch {
    return `${value.toFixed(unit === 0 ? 0 : 1)} ${['B', 'KB', 'MB'][unit]}`
  }
}

/** A draft as the review list holds it: ticked to import or not. */
export interface ReviewDraft extends DraftFaq { picked: boolean }

/** The AI's drafts, all ticked, keywords as the server takes them. */
export function reviewDrafts(items: readonly Partial<DraftFaq>[] | undefined): ReviewDraft[] {
  return (items ?? [])
    .filter(item => typeof item.question === 'string' && typeof item.answer === 'string')
    .map(item => ({
      question: String(item.question).slice(0, KNOWLEDGE_LIMITS.question),
      answer: String(item.answer).slice(0, KNOWLEDGE_LIMITS.answer),
      keywords: (item.keywords ?? []).map(k => String(k).trim().slice(0, KNOWLEDGE_LIMITS.keyword)).filter(Boolean),
      picked: true,
    }))
}

/** The ticked drafts with a question and an answer, at most 50 (bulk-import-faqs' limit). */
export function pickedDrafts(drafts: readonly ReviewDraft[]): DraftFaq[] {
  return drafts
    .filter(d => d.picked && d.question.trim() && d.answer.trim())
    .slice(0, KNOWLEDGE_LIMITS.importMax)
    .map(d => ({ question: d.question.trim(), answer: d.answer.trim(), keywords: d.keywords }))
}

/** The body of POST knowledge/bulk-import-faqs (no category: the server files them under "AI Generated"). */
export function importPayload(drafts: readonly ReviewDraft[], categoryId: number | null): Record<string, unknown> {
  return { category_id: categoryId, items: pickedDrafts(drafts) }
}

/** Whether a pasted text is long enough, and not too long, to draft from. */
export function sourceUsable(text: string): boolean {
  const n = text.trim().length
  return n >= KNOWLEDGE_LIMITS.sourceMin && n <= KNOWLEDGE_LIMITS.sourceMax
}
