import type { QueryClient } from '@tanstack/react-query'
import { HandHeart, Megaphone, Receipt, type LucideIcon } from 'lucide-react'
import type { Category } from './templateLogic'

/** The templates area's query keys, and what a write makes stale. */
export const TEMPLATES_KEY = ['crm', 'templates'] as const
export const MERGE_TAGS_KEY = ['crm', 'templates', 'merge-tags'] as const

/** After a template was made, changed or deleted: this list, and the one a lead's "Send an email" offers. */
export function templatesChanged(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
  void qc.invalidateQueries({ queryKey: ['crm', 'leads', 'email-templates'] })
}

/** Each category's icon in the list and the editor. */
export const CATEGORY_ICON: Record<Category, LucideIcon> = { campaign: Megaphone, transactional: Receipt, welcome: HandHeart }
